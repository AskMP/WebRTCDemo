import { EventEmitter } from "./eventEmitter.class.js";

const   mediaStream = Symbol('mediaStream');
/***
 * The Viewer handles all aspects of receiving data from
 * the broadcaster class.
 * 
 * As it is the viewer who intigates a call first by providing
 * the ID to which to send the offer to, there is a helper
 * method to use in order to begin the process:
 * {this}.watch(broadcasterId)
 * 
 * Communication of ice candidates and requests are needed
 * to be performed by an external communication method which
 * is handled by listening for specific events:
 * Events:
 *  "sendRequest":
 *      Sends a request to the broadcaster to be offered
 *      the video data over WebRTC
 *      data {
 *          name : The ID of the viewer
 *          target : The ID of the broadcaster
 *      }
 *  "sendAccept":
 *      Sends the final acceptance and SDP answer to the
 *      broadcaster with the response completion data
 *      data {
 *          name : The ID of the viewer
 *          target : The ID of the broadcaster
 *          sdp : The WebRTC acceptance
 *      }
 *  "iceCandidate":
 *      There is a new ICE Candidate that needs to be
 *      sent to a target.
 *      data {
 *          name : The ID of the viewer
 *          target : The ID of the broadcaster
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
 *      target : [the id of this viewer],
 *      candidate : the ICE candidate being added
 * }
 * 
 * Once the connection has been made and the viewer starts
 * receiving video, there is a new event triggered which
 * supplies the the MediaStream that can be assigned to
 * a video tags srcObject attribute
 *  "receivingMediaStream"
 *      The triggering of the MediaStream object from the
 *      broadcaster
 *      data { MediaStream }
 * 
 * Other aspects like when new viewers connect, when the
 * broadcasting starts, and halts are also available:
 * Events:
 *  "connected"
 *      The connection to the broadcaster has been completed
 *  "disconnected"
 *      The connection to the broadcaster has been severed
 */
export class WebRTCViewer extends EventEmitter {

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
        this.watching   = false;

        this[mediaStream] = false;

        this.ready();
    }

    watch(broadcasterId) {
        if (this.watching) throw new Error(`You must first leave the current room.`);
        this.watching = broadcasterId;
        this.emit('sendRequest', { target : this.watching, name: this.id });
    }

    addIceCandidate(data) {
        if (!data.target || data.target !== this.id || data.target !== this.id || !this.broadcaster) return;
        this.broadcaster.addIceCandidate(new RTCIceCandidate(data.candidate))
            .catch(err => console.error(err));
    }

    receiveOffer(offer) {
        if (offer.target !== this.id) return;
        this.broadcaster = new RTCPeerConnection({ iceServers: this.iceServers });

        // Now that we have an offer, we can start listening to the peer connection events
        ['icecandidate', 'iceconnectionstatechange', 'track'].forEach(event => {
            this.broadcaster.addEventListener(event, evt => this[event](evt, offer));
        });

        // With all the listeners attached, we can initiate the session descriptions
        // that were passed to us and submit a response back to the originator
        this.broadcaster.setRemoteDescription(new RTCSessionDescription(offer.sdp))
            .then(() => this.broadcaster.createAnswer())
            .then(answer => {
                this.broadcaster.setLocalDescription(answer);
                this.emit('sendAccept', {
                    target: offer.name,
                    name : this.id,
                    sdp: answer
                });
            })
            .catch(err => console.error(err));
    }

    icecandidate(evt, offer) {
        if (!evt.candidate) return;
        this.emit('iceCandidate', {
            target: offer.name,
            name: this.id,
            candidate: evt.candidate
        });
    }

    iceconnectionstatechange(evt) {
        switch (evt.currentTarget.iceConnectionState) {
            case 'connected': this.emit('connected'); break;
            case 'disconnected': this.emit('disconnected'); break;
        }
    }

    track(evt) {
        if (!evt || !evt.streams[0] || evt.streams[0].constructor.name !== 'MediaStream') return;
        this[mediaStream] = evt.streams[0];
        this.emit('receivingMediaStream', this[mediaStream]);
    }

}

export { WebRTCViewer as default };