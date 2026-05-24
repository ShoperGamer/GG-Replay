package inference

type CreateSongOptions struct {
	OutputName          string `json:"outputName,omitempty"`
	Pitch               *int   `json:"pitch,omitempty"`
	InstrumentalsPitch  *int   `json:"instrumentalsPitch,omitempty"`
	VocalsOnly          bool   `json:"vocalsOnly,omitempty"`
	PreStemmed          bool   `json:"preStemmed,omitempty"`
	SampleMode          bool   `json:"sampleMode,omitempty"`
	SampleModeStartTime *int   `json:"sampleModeStartTime,omitempty"`
	StemmingMethod      string `json:"stemmingMethod,omitempty"`
	F0Method            string `json:"f0Method,omitempty"`
	OutputFormat        string `json:"outputFormat,omitempty"`
	Device              string `json:"device,omitempty"`
	GPU                 *bool  `json:"gpu,omitempty"`
	DeEchoDeReverb      bool   `json:"deEchoDeReverb,omitempty"`
	IndexRatio          *float64 `json:"indexRatio,omitempty"`
	ConsonantProtection *float64 `json:"consonantProtection,omitempty"`
}

func (o *CreateSongOptions) GetPitch() int {
	if o != nil && o.Pitch != nil { return *o.Pitch }
	return 0
}
func (o *CreateSongOptions) GetInstrumentalsPitch() int {
	if o != nil && o.InstrumentalsPitch != nil { return *o.InstrumentalsPitch }
	return 0
}
func (o *CreateSongOptions) GetSampleModeStartTime() int {
	if o != nil && o.SampleModeStartTime != nil { return *o.SampleModeStartTime }
	return 0
}
func (o *CreateSongOptions) GetF0Method() string {
	if o != nil && o.F0Method != "" { return o.F0Method }
	return "rmvpe"
}
func (o *CreateSongOptions) GetOutputFormat() string {
	if o != nil && o.OutputFormat != "" { return o.OutputFormat }
	return "mp3_320k"
}
func (o *CreateSongOptions) GetDevice() string {
	if o != nil && o.Device != "" { return o.Device }
	return "cpu"
}
func (o *CreateSongOptions) GetStemmingMethod() string {
	if o != nil && o.StemmingMethod != "" { return o.StemmingMethod }
	return "UVR-MDX-NET Voc FT"
}