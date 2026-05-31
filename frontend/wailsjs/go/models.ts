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
	export class LogEntry {
	    timestamp: number;
	    time: string;
	    level: string;
	    source: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.time = source["time"];
	        this.level = source["level"];
	        this.source = source["source"];
	        this.message = source["message"];
	    }
	}
	export class MixTrack {
	    path: string;
	    volume: number;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new MixTrack(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.volume = source["volume"];
	        this.name = source["name"];
	    }
	}
	export class MultiTrackMixRequest {
	    vocalPath: string;
	    vocalVol: number;
	    instTracks: MixTrack[];
	    outputName: string;
	
	    static createFrom(source: any = {}) {
	        return new MultiTrackMixRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.vocalPath = source["vocalPath"];
	        this.vocalVol = source["vocalVol"];
	        this.instTracks = this.convertValues(source["instTracks"], MixTrack);
	        this.outputName = source["outputName"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
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

