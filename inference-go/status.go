package inference

import (
	"sync"
	"time"
)

// STATUS represents job status
type STATUS string

const (
	StatusQueued     STATUS = "queued"
	StatusProcessing STATUS = "processing"
	StatusCompleted  STATUS = "completed"
	StatusErrored    STATUS = "errored"
	StatusStopped    STATUS = "stopped"
	StatusUnknown    STATUS = "unknown_job"
)

// JobProgressResp represents job progress response (ใช้รองรับ JSON จาก Python ด้วย)
type JobProgressResp struct {
	Status              STATUS             `json:"status"`
	Message             string             `json:"message"`
	Error               *string            `json:"error,omitempty"`
	JobId               string             `json:"jobId,omitempty"`
	TrackName           string             `json:"trackName,omitempty"`
	ModelId             string             `json:"modelId,omitempty"`
	ElapsedSeconds      *float64           `json:"elapsedSeconds,omitempty"`
	RemainingSeconds    *float64           `json:"remainingSeconds,omitempty"`
	OutputFilepath      *string            `json:"outputFilepath,omitempty"`
	InputFilepath       *string            `json:"inputFilepath,omitempty"`
	PreDeechoVocalsFile *string            `json:"preDeechoVocalsFile,omitempty"`
	OriginalVocalsPath  *string            `json:"originalVocalsPath,omitempty"`
	ConvertedVocalsPath *string            `json:"convertedVocalsPath,omitempty"`
	InstrumentalsPath   *string            `json:"instrumentalsPath,omitempty"`
	Options             *CreateSongOptions `json:"options,omitempty"`
	SongHash            *string            `json:"songHash,omitempty"`
}

// StatusTracker tracks job status
type StatusTracker struct {
	mu              sync.RWMutex
	status          STATUS
	message         string
	err             error
	startTime       time.Time
	elapsedSeconds  float64
	outputFilepath  string
	inputFilepath   string
	trackName       string
	modelId         string
	jobId           string
	songHash        string
	options         *CreateSongOptions
	vocalsFile      string
	instrumentals   string
	convertedVocals string
	preDeecho       string
}

func NewStatusTracker(jobId, trackName, modelId string, options *CreateSongOptions) *StatusTracker {
	return &StatusTracker{
		status:    StatusQueued,
		message:   "Waiting in queue...",
		startTime: time.Now(),
		jobId:     jobId,
		trackName: trackName,
		modelId:   modelId,
		options:   options,
	}
}

func (st *StatusTracker) SetStatus(status STATUS, message string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.status = status
	st.message = message
	st.elapsedSeconds = time.Since(st.startTime).Seconds()
}

func (st *StatusTracker) SetError(err error) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.err = err
	st.status = StatusErrored
}

func (st *StatusTracker) SetOutputFilepath(path string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.outputFilepath = path
}

func (st *StatusTracker) SetInputFilepath(path string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.inputFilepath = path
}

func (st *StatusTracker) SetSongHash(hash string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.songHash = hash
}

func (st *StatusTracker) SetVocalsFile(path string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.vocalsFile = path
}

func (st *StatusTracker) SetInstrumentals(path string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.instrumentals = path
}

func (st *StatusTracker) GetProgress() JobProgressResp {
	st.mu.RLock()
	defer st.mu.RUnlock()

	resp := JobProgressResp{
		Status:    st.status,
		Message:   st.message,
		JobId:     st.jobId,
		TrackName: st.trackName,
		ModelId:   st.modelId,
		Options:   st.options,
	}

	if st.err != nil {
		errStr := st.err.Error()
		resp.Error = &errStr
	}

	elapsed := st.elapsedSeconds
	resp.ElapsedSeconds = &elapsed

	if st.outputFilepath != "" { resp.OutputFilepath = &st.outputFilepath }
	if st.inputFilepath != "" { resp.InputFilepath = &st.inputFilepath }
	if st.songHash != "" { resp.SongHash = &st.songHash }
	if st.vocalsFile != "" { resp.OriginalVocalsPath = &st.vocalsFile }
	if st.instrumentals != "" { resp.InstrumentalsPath = &st.instrumentals }
	if st.convertedVocals != "" { resp.ConvertedVocalsPath = &st.convertedVocals }
	if st.preDeecho != "" { resp.PreDeechoVocalsFile = &st.preDeecho }

	return resp
}