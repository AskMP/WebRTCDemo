import { EventEmitter } from './eventEmitter.class.js';

const   stream  = Symbol('stream'),
        devices = Symbol('devices');

export class WebRTCVideo extends EventEmitter {

    constructor(mediaStream = false) {
        super();
        this[stream]        = null;
        this[devices]       = [];

        if (mediaStream) this.mediaStream = mediaStream;
        
        this.getMediaDevices();
    }

    set mediaStream(v) {
        if (v.constructor.name !== 'MediaStream') throw new Error(`Invalid MediaStream provided for stream value.`);
        this[stream] = v;
        this.emit('updatedMediaStream', this.mediaStream);
    }
    get mediaStream() { return this[stream]; }
    
    set devices(v) { throw new Error(`You cannot set a readonly value.`); }
    get devices() { return this[devices]; }
    
    async getMediaDevices(constraints = { video: true, aspectRatio: 1920/1080 }) {
        try {
            this[devices] = await navigator.mediaDevices.enumerateDevices({
                width: { min: 1280, ideal: 1920, max: 1920 },
                height: { min: 720, ideal: 1080 },
                aspectRatio: 1.777777778,
            });
            this[devices] = this[devices].filter(d => d.label.trim() !== '');
            this.emit('devices', this[devices]);
        } catch (err) {
            throw new Error(err);
        }
    }

    async setMediaDevice(id = false) {
        let constraints = (typeof id === 'object') ? id : {
            video : { deviceId : id },
            width: { min: 1280, ideal: 1920, max: 1920 },
            height: { min: 720, ideal: 1080 },
            aspectRatio: 1.777777778,
        };

        try {
            let stream = await navigator.mediaDevices.getUserMedia(constraints);
            stream.getTracks().forEach(t => t.applyConstraints(constraints));
            this.mediaStream = stream;
        } catch (err) {
            throw new Error(err);
        }
        
    }

}

export { WebRTCVideo as default };