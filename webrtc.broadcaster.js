import { EventEmitter } from './eventEmitter.class.js';

const   broadcasting = Symbol('broadcasting'),
        mediaStream = Symbol('mediaStream'),
        viewers = Symbol('viewers');

/***
 * The Broadcaster handles all the aspects of sending data
 * to any of the viewers that have joined.
 * 
 * To start broadcasting, you need to activate the broadcaster
 * by passing a MediaSource object from a video tag into
 * a start method:
 * {this}.start(MediaSource)
 * 
 * Communication of ice candidates and requests are needed
 * to be performed by an external communication method which
 * is handled by listening for specific events:
 * Events:
 *  "sendOffer":
 *      An offer has been created and needs to be sent to
 *      the requesting viewer.
 *      data {
 *          name : The ID of the broadcaster
 *          target : The ID of the viewer
 *          sdp : The initial WebRTC offer
 *      }
 *  "iceCandidate":
 *      There is a new ICE Candidate that needs to be
 *      sent to a target.
 *      data {
 *          name : The ID of the broadcaster
 *          target : The ID of the viewer
 *          candidate : The ICE candidate
 *      }
 * 
 * Because ICE candidates also come from the viewers as
 * a confirmation. Any events that come in from the server
 * to confirm ICE candidates can be passed in by the
 * addIceCandidate method:
 * {this}.addIceCandidate(candidate)
 * *Please note that the candidate must follow the structure:
 * {
 *      name : [Who the candidate is from],
 *      target : [the id of this broadcaster],
 *      candidate : the ICE candidate being added
 * }
 * 
 * Other aspects like when new viewers connect, when the
 * broadcasting starts, and halts are also available:
 * Events:
 *  "broadcasting"
 *      The broadcast has started and will accept new
 *      request commands.
 *  "halted"
 *      The broadcast has halted and will no longer
 *      accept new requests.
 *  "viewerConnected"
 *      A new viewer has successfully connected to the
 *      broadcast and is viewing the video.
 *  "viewerDisconnected"
 *      A viewer has disconnected from the broadcast.
 * 
 * You can check the viewer count at any point by reading
 * the viewer attribute or counting it's size:
 * let currentViewerCount = {this}.viewers.length
 */
export class WebRTCBroadcaster extends EventEmitter {

    constructor(config = {}) {
        super();

        config = Object.assign({
            url : '/',
            iceServers : [],
            id : Array(4).fill('').map(i => Math.floor(Math.random() * 100000000).toString(32)).join('-')
        }, config);

        // The communication servers for requests to go through
        this.id         = config.id;
        this.url        = config.url;
        this.iceServers = config.iceServers;
        
        /***
         * Readonly Values
         */
        this[broadcasting]  = false;
        this[mediaStream]   = false;
        this[viewers]       = [];

        this.ready();
    }

    set viewers(v) { throw new Error(`You cannot set a readonly value.`); }
    get viewers() { return this[viewers]; }
    set broadcasting(v) { throw new Error(`You cannot set a readonly value.`); }
    get broadcasting() { return this[broadcasting]; }

    start(stream) {
        if (!!this[broadcasting]) return;
        if (!stream || stream.constructor.name !== 'MediaStream') throw new Error(`You must choose a video source before starting to broadcast.`);
        this[broadcasting] = true;
        this[mediaStream] = stream;
        this.emit('broadcasting');
    }

    stop() {
        if (!this[broadcasting]) return;
        this[broadcasting] = false;
        this[mediaStream] = false;
        this.emit('halted');
    }

    addIceCandidate(data) {
        if (!data.target || data.target !== this.id || !this.viewers[data.name]) return;
        this.viewers[data.name].addIceCandidate(new RTCIceCandidate(data.candidate))
            .catch(err => console.error(err));
    }

    viewerConfirm(answer) {
        if (answer.target !== this.id || !this.viewers[answer.name] || !answer.sdp) return;
        this.viewers[answer.name]
            .setRemoteDescription(new RTCSessionDescription(answer.sdp))
            .catch(err => console.error(err, answer));
    }

    viewerRequest(request) {
        if (!request.name) return;
        this.viewers[request.name] = new RTCPeerConnection({ iceServers: this.iceServers });
        ['icecandidate', 'iceconnectionstatechange', 'negotiationneeded'].forEach(event => {
            this.viewers[request.name].addEventListener(event, evt => this[event](evt, request));
        });
        this[mediaStream]
            .getTracks()
            .forEach(track => this.viewers[request.name].addTransceiver(track, {streams: [this[mediaStream]]}));

    }

    icecandidate(evt, request) {
        if (!evt.candidate) return;
        this.emit('iceCandidate', {
            target: request.name,
            name: this.id,
            candidate: evt.candidate
        });
    }

    iceconnectionstatechange(evt) {
        switch (evt.currentTarget.iceConnectionState) {
            case 'connected': this.emit('viewerConnected'); break;
            case 'disconnected':
                this.emit('viewerDisconnected');
                Object.keys(this.viewers)
                    .forEach(viewer => {
                        if (this.viewers[viewer] === evt.currentTarget) delete this.viewers[viewer];
                    });
                break;
        }
    }

    async negotiationneeded(evt, request) {
        if (!this.viewers[request.name]) return;
        let offer = await this.viewers[request.name].createOffer();
        if (this.viewers[request.name].signalingState !== 'stable') return;
        this.viewers[request.name].setLocalDescription(offer)
            .then(() => this.emit('sendOffer', {
                target : request.name,
                name : this.id,
                sdp : this.viewers[request.name].localDescription
            }))
            .catch(err => console.error(err));
    }

}

export { WebRTCBroadcaster as default };