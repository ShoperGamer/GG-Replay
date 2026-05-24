package main

import (
	"time"
)

type STATUS string

const (
	StatusQueued     STATUS = "queued"
	StatusProcessing STATUS = "processing"
	StatusCompleted  STATUS = "completed"
	StatusErrored    STATUS = "errored"
	StatusStopped    STATUS = "stopped"
	StatusUnknown    STATUS = "unknown_job"
)

type CreateSongOptions struct {
	OutputName          string   `json:"outputName,omitempty"`
	Pitch               int      `json:"pitch,omitempty"`
	InstrumentalsPitch  int      `json:"instrumentalsPitch,omitempty"`
	VocalsOnly          bool     `json:"vocalsOnly,omitempty"`
	PreStemmed          bool     `json:"preStemmed,omitempty"`
	SampleMode          bool     `json:"sampleMode,omitempty"`
	SampleModeStartTime int      `json:"sampleModeStartTime,omitempty"`
	StemmingMethod      string   `json:"stemmingMethod,omitempty"`
	F0Method            string   `json:"f0Method,omitempty"`
	OutputFormat        string   `json:"outputFormat,omitempty"`
	Device              string   `json:"device,omitempty"`
	GPU                 *bool    `json:"gpu,omitempty"`
	DeEchoDeReverb      bool     `json:"deEchoDeReverb,omitempty"`
}

type CreateSongReq struct {
	ModelId           string             `json:"modelId"`
	ModelPath         string             `json:"modelPath"`
	WeightsPath       string             `json:"weightsPath"`
	SongUrlOrFilePath string             `json:"songUrlOrFilePath"`
	OutputDirectory   string             `json:"outputDirectory"`
	Options           *CreateSongOptions `json:"options,omitempty"`
}

type JobProgressReq struct {
	JobId string `json:"jobId"`
}

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

type CreateSongResp struct {
	JobId string `json:"jobId"`
}

type DeviceOptionsResp struct {
	Devices []string `json:"devices"`
}

type StopJobReq struct {
	JobId string `json:"jobId"`
}

type HealthResp struct {
	Status    string `json:"status"`
	Timestamp int64  `json:"timestamp"`
}

type Job struct {
	ID        string
	Request   CreateSongReq
	CreatedAt time.Time
}