import { WebRTCBroadcaster } from './webrtc.broadcaster.js';
import { WebRTCViewer } from './webrtc.viewer.js';
import { WebRTCVideo } from './webrtc.video.js';

const   VIEWER = 'viewer',
        BROADCASTER = 'broadcaster',
        role = Symbol('role'),
        type = Symbol('type');

class WebRTCDemo {

    constructor() {

        this.iceServers = [
            {urls:'stun:stun.l.google.com:19302' },
            {urls:'stun:stun1.l.google.com:19302'},
            {urls:'stun:stun2.l.google.com:19302'},
            {urls:'stun:stun3.l.google.com:19302'},
            {urls:'stun:stun4.l.google.com:19302'}
        ];

        this.dom = {
            roomInput : document.getElementById('room'),
            usernameInput : document.getElementById('username'),
            participantType : Array.from(document.querySelectorAll('[name="participantType"]')),
            videoPreview : document.getElementById('previewWindow'),
            deviceList : document.getElementById('deviceList'),
            toggleBroadcasting : document.getElementById('toggle'),
            joinRoomBtn : document.getElementById('join'),
            chatInput : document.getElementById('chatInput').querySelector('textarea'),
            chatArea : document.getElementById('chatArea')
        };

        this.dom.roomInput.value = (document.location.hash.replace(/\#/gi, '').trim());

        this.server = io.connect();

        this[role] = VIEWER;
        
        this.username = false;
        this.lastMessage = false;

        this.video = new WebRTCVideo();
        this.convertToViewer();
        this.addVideoListeners();
        this.addSocketListeners();
        this.addDomListeners();
    }

    get role() {
        return this[role];
    }

    set role(v) {
        if (![VIEWER, BROADCASTER].includes(v)) throw new Error(`Invalid role ${v}`);
        this[v] = v;
    }

    addVideoListeners() {
        this.video.on('devices', devices => {
            this.dom.deviceList.innerHTML = devices
                .filter(d => d.kind === 'videoinput')
                .sort((a, b) => a.label > b.label ? 1 : -1)
                .map(d =>  `<option value="${d.deviceId}">${d.label}</option>`)
                .join('');
        });
        
        this.video.on('updatedMediaStream', (stream) => {
            this.dom.videoPreview.srcObject = stream;
        });
    }

    addSocketListeners() {
        this.server.on('connect', () => this[type].id = this.server.id);
        this.server.on('userJoin', (userName) => this.chatUserJoined(userName));
        this.server.on('userLeft', (userName) => this.chatUserLeft(userName));
        this.server.on('message', (message) => this.chatMessage(message));
        this.server.on('broadcastStarted', (broadcasterID) => this.broadcastStarted(broadcasterID));
        this.server.on('broadasterLeft', () => this.broadasterLeft());
        this.server.on('webrtc_message', (message) => this.processWebRTCMessage(message));
        this.server.on('loggedIn', () => this.initializeLogin());

    }

    addDomListeners() {
        this.dom.chatInput.addEventListener('keyup', (evt) => this.checkForSend(evt));
        this.dom.joinRoomBtn.addEventListener('click', (evt) => this.joinRoom(evt));
        this.dom.deviceList.addEventListener('change', () => this.updateMediaDevice());
        this.dom.toggleBroadcasting.addEventListener('click', () => this.toggleBroadcast());
        this.dom.participantType.forEach(type => {
            type.addEventListener('click', (evt) => (this[role] === VIEWER) ? this.convertToBroadcaster() : this.convertToViewer());
        });
    }

    checkForSend(evt) {
        if (!evt || !evt.key) return;
        switch (evt.key) {
            case 'Enter':
                if (evt.altKey || evt.ctrlKey || evt.shiftKey) return;
                let str = this.dom.chatInput.value.trim();
                if (str === '') return;
                this.server.emit('message', { text : str });
                this.dom.chatInput.value = '';
        }
    }

    convertToBroadcaster() {
        document.body.classList.add('broadcaster');
        this[role] = BROADCASTER;
        this[type] = new WebRTCBroadcaster({iceServers: this.iceServers});
        if (this.server.connected) this[type].id = this.server.id;

        this[type].on('broadcasting', () => this.initializeBroadcasting());
        this[type].on('sendOffer', (offer) => this.sendWebRTCMessage('viewerApproval', offer));
        this[type].on('iceCandidate', (candidate) => this.sendWebRTCMessage('iceCandidate', candidate));
        this[type].on('halted', () => this.completeBroadcast());
    }

    convertToViewer() {
        document.body.classList.remove('broadcaster');
        this[role] = VIEWER;
        this[type] = new WebRTCViewer({iceServers: this.iceServers});
        if (this.server.connected) this[type].id = this.server.id;

        this[type].on('receivingMediaStream', (stream) => this.attachMediaStream(stream));
        this[type].on('sendRequest', (request) => this.sendWebRTCMessage('viewerRequest', request));
        this[type].on('sendAccept', (response) => this.sendWebRTCMessage('viewerConfirm', response));
        this[type].on('iceCandidate', (candidate) => this.sendWebRTCMessage('iceCandidate', candidate));
    }

    sendWebRTCMessage(action, data) {
        this.server.emit('webrtc_message', { action: action, data: data });
    }

    processWebRTCMessage(message) {
        switch (message.action) {
            case 'viewerRequest':
                if (this[role] === BROADCASTER) this[type].viewerRequest(message.data);
                break;
            case 'viewerConfirm':
                if (this[role] === BROADCASTER) this[type].viewerConfirm(message.data);
                break;
            case 'viewerApproval':
                if (this[role] === VIEWER) this[type].receiveOffer(message.data);
                break;
            case 'iceCandidate':
                this[type].addIceCandidate(message.data);
                break;
        }
    }

    joinRoom(evt) {
        evt.preventDefault();
        if (this.dom.joinRoomBtn.disabled) return;
        if (this.dom.roomInput.value.trim() === '') {
            alert(`The room name cannot be blank`);
            return;
        }
        this.dom.roomInput.value = this.dom.roomInput.value.trim().toLowerCase();
        if (this.dom.usernameInput.value.trim() === '') {
            alert(`Please confirm a username first`);
            return;
        }
        this.username = this.dom.usernameInput.value.trim();
        this.dom.roomInput.disabled = true;
        this.dom.usernameInput.disabled = true;
        this.server.emit('joinRoom', {
            room: this.dom.roomInput.value,
            name : this.dom.usernameInput.value.trim()
        });
    }

    initializeLogin() {
        this.dom.chatInput.disabled = false;
        document.getElementById('participantType').style.display = 'block';
        let shareButton = document.createElement('button');
        shareButton.textContent = 'Share Link';
        document.getElementById('roomInfo').innerHTML = '';
        
        document.getElementById('roomInfo').appendChild(shareButton);
        shareButton.addEventListener('click', () => this.shareLink());
    }
    
    updateMediaDevice() {
        this.video.setMediaDevice(this.dom.deviceList.value);
    }
    
    shareLink() {
        if (this.dom.roomInput.value.trim() === '') {
            alert('You need to join a room before being able to share it.');
            return;
        }
        let ta = document.createElement('textarea');
        ta.style = 'position: absolute; opacity: 0';
        ta.value = `${document.location.origin}${document.location.pathname}#${this.dom.roomInput.value.trim().toLowerCase()}`;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.parentNode.removeChild(ta);
        alert(`The room URL has been copied to your clipboard`);
    }

    toggleBroadcast() {
        console.log(this[role]);
        if (this[role] !== BROADCASTER) return;
        if (!this[type].broadcasting) this[type].start(this.video.mediaStream);
        else this[type].stop();
    }

    initializeBroadcasting() {
        this.server.emit('initializeBroadcaster');
        document.getElementById('participantType').style.display = 'none';
        this.dom.toggleBroadcasting.textContent = 'Stop';
        this.dom.deviceList.style.display = 'none';
        let s = document.createElement('small');
        s.textContent = `Broadcast started`;
        this.dom.chatArea.append(s);
    }

    completeBroadcast() {
        this.dom.toggleBroadcasting.textContent = 'Broadcast';
    }

    chatUserJoined(userName = 'A new') {
        let s = document.createElement('small');
        s.textContent = `${userName} has joined`;
        chatArea.append(s);
    }

    chatUserLeft(userName = 'A user') {
        let s = document.createElement('small');
        s.textContent = `${userName} has left`;
        chatArea.append(s);
    }

    chatMessage(message) {
        if (!this.lastMessage || this.lastMessage.from !== message.from) {
            let messageDom = document.createElement('details');
            messageDom.open = true;
            messageDom.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); return false; }, false);
            message.createdAt = new Date(message.createdAt);
            if (message.from === this.username) messageDom.classList.add('me');
            messageDom.innerHTML = `<summary><time>${message.createdAt.toLocaleTimeString()}</time>${message.from}</summary><dt>${message.text}</dt>`;
            this.lastMessage = {
                dom : messageDom,
                from : message.from
            };
            this.dom.chatArea.appendChild(messageDom);
        } else {
            let dtDom = document.createElement('dt');
            dtDom.textContent = message.text;
            this.lastMessage.dom.appendChild(dtDom);
        }
    }

    broadcastStarted(broadcasterID) {
        if (this[role] !== VIEWER) return;
        document.getElementById('participantType').style.display = 'none';
        let s = document.createElement('small');
        s.textContent = `Broadcast started`;
        this.dom.chatArea.append(s);
        this[type].watch(broadcasterID);
    }

    broadasterLeft() {
        this.dom.videoPreview.pause();
        this.dom.videoPreview.srcObject.srcObject = null;
        let s = document.createElement('small');
        s.textContent = `Broadcast has stopped`;
        this.dom.chatArea.append(s);
    }

    attachMediaStream(stream) {
        this.dom.deviceList.style.display = 'none';
        this.dom.toggleBroadcasting.style.display = 'none';
        this.video.mediaStream = stream;
    }

}

window.demo = new WebRTCDemo();