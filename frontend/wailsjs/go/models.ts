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
	
	    static createFrom(source: any = {}) {
	        return new DemucsRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceAudioPath = source["sourceAudioPath"];
	        this.model = source["model"];
	        this.device = source["device"];
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
	    outputName: string;
	    device: string;
	    gpu: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SongOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
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
	        this.outputName = source["outputName"];
	        this.device = source["device"];
	        this.gpu = source["gpu"];
	    }
	}

}

