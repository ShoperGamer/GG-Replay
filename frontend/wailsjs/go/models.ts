export namespace main {
	
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
	    }
	}

}

