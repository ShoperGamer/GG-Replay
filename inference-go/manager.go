package inference

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

type InferenceManager struct {
	modelName, modelsPath, weightsPath, sourceAudioPath, outputDirectory string
	options                                                              *CreateSongOptions
	jobId                                                                string
	trackMD5, trackName, originalsFile, vocalsFile, instrumentalsFile    string
	originalsDirectory, stemsDirectory                                   string

	statusTracker *StatusTracker
	configManager *ConfigManager
	fileUtils     *FileUtils
	pythonBridge  *PythonBridge
	logger        *log.Logger

	setStatus    func(JobProgressResp)
	checkStopJob func() bool
}

func NewInferenceManager(
	modelName, modelsPath, weightsPath, sourceAudioPath, outputDirectory string,
	options *CreateSongOptions, jobId, pythonPath, pythonDir string,
	setStatus func(JobProgressResp), checkStopJob func() bool, logger *log.Logger,
) *InferenceManager {
	if options == nil {
		options = &CreateSongOptions{}
	}
	if setStatus == nil {
		setStatus = func(resp JobProgressResp) {
			logger.Printf("Status: %s", resp.Message)
		}
	}
	if checkStopJob == nil {
		checkStopJob = func() bool { return false }
	}

	trackName := filepath.Base(sourceAudioPath)
	if ext := filepath.Ext(trackName); ext != "" {
		trackName = trackName[:len(trackName)-len(ext)]
	}

	return &InferenceManager{
		modelName:          modelName,
		modelsPath:         modelsPath,
		weightsPath:        weightsPath,
		sourceAudioPath:    sourceAudioPath,
		outputDirectory:    filepath.Join(outputDirectory, jobId),
		options:            options,
		jobId:              jobId,
		trackName:          trackName,
		originalsDirectory: filepath.Join(outputDirectory, "originals"),
		stemsDirectory:     filepath.Join(outputDirectory, "stems"),
		statusTracker:      NewStatusTracker(jobId, trackName, modelName, options),
		configManager:      NewConfigManager(),
		fileUtils:          NewFileUtils(),
		pythonBridge:       NewPythonBridge(pythonPath, pythonDir, logger),
		logger:             logger,
		setStatus:          setStatus,
		checkStopJob:       checkStopJob,
	}
}

func (im *InferenceManager) Infer(ctx context.Context) error {
	im.updateStatus(StatusProcessing, "Starting up...")
	if err := im.checkDeps(); err != nil {
		return err
	}
	if err := im.setTrackValues(im.sourceAudioPath); err != nil {
		return err
	}

	im.updateStatus(StatusProcessing, "Preparing AI Pipeline...")
	if err := im.performInference(ctx); err != nil {
		im.statusTracker.SetError(err)
		im.setStatus(im.statusTracker.GetProgress())
		return err
	}

	if im.statusTracker.GetProgress().Status != StatusStopped {
		im.updateStatus(StatusCompleted, "Completed")
	}
	return nil
}

func (im *InferenceManager) checkDeps() error {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return fmt.Errorf("ffmpeg not found: %w", err)
	}
	return nil
}

func (im *InferenceManager) setTrackValues(trackPath string) error {
	if !im.fileUtils.FileExists(trackPath) {
		return fmt.Errorf("source audio not found: %s", trackPath)
	}
	im.trackName = im.fileUtils.GetTrackName(trackPath)

	md5Hash, err := im.fileUtils.CalculateMD5(trackPath)
	if err != nil {
		return err
	}
	im.trackMD5 = md5Hash
	im.statusTracker.SetSongHash(im.trackMD5)

	im.fileUtils.EnsureDir(im.originalsDirectory)
	ext := im.fileUtils.GetExtension(trackPath)
	im.originalsFile = filepath.Join(im.originalsDirectory, fmt.Sprintf("%s%s", im.trackMD5, ext))

	if !im.fileUtils.FileExists(im.originalsFile) {
		if err := im.fileUtils.CopyFile(trackPath, im.originalsFile); err != nil {
			return err
		}
	}

	im.sourceAudioPath = im.originalsFile
	im.statusTracker.SetInputFilepath(im.sourceAudioPath)
	return nil
}

func (im *InferenceManager) performInference(ctx context.Context) error {
	// 🚨 Validate ก่อนส่ง Python
	if im.modelName == "" {
		return fmt.Errorf("modelName is empty")
	}
	if im.modelsPath == "" {
		return fmt.Errorf("modelsPath is empty")
	}
	if im.weightsPath == "" {
		im.logger.Printf("⚠️ weightsPath empty, using modelsPath")
		im.weightsPath = im.modelsPath
	}
	if im.sourceAudioPath == "" {
		return fmt.Errorf("sourceAudioPath is empty")
	}

	baseDir, _ := os.Getwd()
	hwConfig := SyncHardwareConfig(im.options, im.configManager, baseDir, im.logger)

	device := "cpu"
	if im.options != nil && im.options.Device != "" {
		device = im.options.Device
		im.logger.Printf("✅ Device from options: %s", device)
	} else {
		device = hwConfig.Device
		im.logger.Printf("✅ Device from hwConfig: %s", device)
	}

	config := PythonWorkerConfig{
		JobId:           im.jobId,
		ModelName:       im.modelName,
		ModelsPath:      im.modelsPath,
		WeightsPath:     im.weightsPath,
		SourceAudioPath: im.sourceAudioPath,
		OutputDirectory: im.outputDirectory,
		Options:         im.options,
		Device:          device,
		IsHalf:          hwConfig.IsHalf,
		ORTProviders:    hwConfig.ORTProviders,
	}

	onProgress := func(resp JobProgressResp) {
		im.statusTracker.SetStatus(resp.Status, resp.Message)
		if resp.OutputFilepath != nil {
			im.statusTracker.SetOutputFilepath(*resp.OutputFilepath)
		}
		if resp.OriginalVocalsPath != nil {
			im.statusTracker.SetVocalsFile(*resp.OriginalVocalsPath)
		}
		if resp.InstrumentalsPath != nil {
			im.statusTracker.SetInstrumentals(*resp.InstrumentalsPath)
		}
		im.setStatus(im.statusTracker.GetProgress())
	}

	return im.pythonBridge.RunInference(ctx, config, onProgress)
}

func (im *InferenceManager) updateStatus(status STATUS, message string) {
	if im.checkStopJob() && status != StatusStopped {
		im.statusTracker.SetStatus(StatusStopped, "Stopped by user")
		im.setStatus(im.statusTracker.GetProgress())
		return
	}
	im.statusTracker.SetStatus(status, message)
	im.setStatus(im.statusTracker.GetProgress())
}

func (im *InferenceManager) GetProgress() JobProgressResp {
	return im.statusTracker.GetProgress()
}