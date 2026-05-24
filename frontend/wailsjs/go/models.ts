export namespace main {
	
	export class DemucsProgress {
	    status: string;
	    message: string;
	    progress: number;
	    stems?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new DemucsProgress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.message = source["message"];
	        this.progress = source["progress"];
	        this.stems = source["stems"];
	    }
	}
	export class DemucsRequest {
	    sourceAudioPath: string;
	    model: string;
	    device: string;
	    removeHum: boolean;
	    removeBackingVocals: boolean;
	    applyPostProcessing: boolean;
	    aggressiveCleanup: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DemucsRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceAudioPath = source["sourceAudioPath"];
	        this.model = source["model"];
	        this.device = source["device"];
	        this.removeHum = source["removeHum"];
	        this.removeBackingVocals = source["removeBackingVocals"];
	        this.applyPostProcessing = source["applyPostProcessing"];
	        this.aggressiveCleanup = source["aggressiveCleanup"];
	    }
	}
	export class DemucsResponse {
	    jobId: string;
	
	    static createFrom(source: any = {}) {
	        return new DemucsResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jobId = source["jobId"];
	    }
	}
	export class SongOptions {
	    outputName: string;
	    pitch: number;
	    instrumentalsPitch: number;
	    preStemmed: boolean;
	    vocalsOnly: boolean;
	    sampleMode: boolean;
	    deEchoDeReverb: boolean;
	    sampleModeStartTime: number;
	    f0Method: string;
	    stemmingMethod: string;
	    indexRatio: number;
	    consonantProtection: number;
	    outputFormat: string;
	    volumeEnvelope: number;
	    device: string;
	    gpu: boolean;
	    removeHum: boolean;
	    removeBackingVocals: boolean;
	    applyPostProcessing: boolean;
	    aggressiveCleanup: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SongOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outputName = source["outputName"];
	        this.pitch = source["pitch"];
	        this.instrumentalsPitch = source["instrumentalsPitch"];
	        this.preStemmed = source["preStemmed"];
	        this.vocalsOnly = source["vocalsOnly"];
	        this.sampleMode = source["sampleMode"];
	        this.deEchoDeReverb = source["deEchoDeReverb"];
	        this.sampleModeStartTime = source["sampleModeStartTime"];
	        this.f0Method = source["f0Method"];
	        this.stemmingMethod = source["stemmingMethod"];
	        this.indexRatio = source["indexRatio"];
	        this.consonantProtection = source["consonantProtection"];
	        this.outputFormat = source["outputFormat"];
	        this.volumeEnvelope = source["volumeEnvelope"];
	        this.device = source["device"];
	        this.gpu = source["gpu"];
	        this.removeHum = source["removeHum"];
	        this.removeBackingVocals = source["removeBackingVocals"];
	        this.applyPostProcessing = source["applyPostProcessing"];
	        this.aggressiveCleanup = source["aggressiveCleanup"];
	    }
	}

}

