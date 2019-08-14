const mimeTypes = {
        "html": "text/html",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
        "js": "text/javascript",
        "css": "text/css"
    },
    fs = require('fs'),
    https = require('https'),
    io = require('socket.io'),
    securePaths = JSON.parse(fs.readFileSync('./sslKeyPaths.json'));

class WebRTCDemoServer {

    constructor() {
        this.rooms = {};
        this.clients = {};
        this.io = false;

        this.createServer()
            .then(() => this.io = io(this.app))
            .then(() => this.setupListeners())
            .then(() => this.app.listen(8080))
            .catch(err => {
                console.error(err);
            });
    }

    setupListeners() {
        return new Promise((resolve, reject) => {
            this.io.on('connection', (connection) => this.initializeConnect(connection));
            resolve();
        });
    }

    initializeConnect(connection) {
        if (this.clients[connection.id]) return;
        this.clients[connection.id] = connection;

        connection.on('disconnect', () => this.connectionDisconnected(connection));
        connection.on('joinRoom', (data) => this.addToRoom(data.room, connection, data.name));
        connection.on('leaveRoom', (data) => this.removeFromRoom(data.room, connection));
        connection.on('message', (data) => this.transportMessage(data, connection));
        connection.on('webrtc_message', (data) => this.webRTCMessage(data, connection));
        connection.on('initializeBroadcaster', () => this.initializeBroadcaster(connection));

    }

    connectionDisconnected(connection) {
        let client = this.clients[connection.id];
        if (!client || !client.room) return;
        this.removeFromRoom(client.room, connection);
        delete this.clients[connection.id];
    }

    addToRoom(roomName, connection, username) {
        if (!roomName || !username) return;
        if (!this.rooms[roomName]) {
            this.rooms[roomName] = {
                name : roomName,
                members : [],
                broadcaster : false
            };
        }
        let member = {
            name : username,
            connection : connection.id
        };
        this.rooms[roomName].members.push(member);
        this.io.to(roomName).emit('userJoin', member.name);
        connection.join(roomName);
        connection.emit('loggedIn');
        connection.emit('otherUsers', this.rooms[roomName].members.map(m => m.name));
        let client = this.clients[connection.id];
        client.room = roomName;
        client.name = username;
        if (!!this.rooms[roomName].broadcaster) connection.emit('broadcastStarted', this.rooms[roomName].broadcaster);
    }

    removeFromRoom(roomName, connection) {
        if (!this.rooms[roomName]) return;
        let member = this.rooms[roomName].members.find(m => m.connection === connection.id);
        if (!member) return;
        connection.leave(roomName);
        this.io.to(roomName).emit('userLeft', member.name);
        if (this.rooms[roomName].members.length === 0) delete rooms[roomName];
        if (this.rooms[roomName].broadcaster && this.rooms[roomName].broadcaster === connection.id) {
            this.rooms[roomName].broadcaster = false;
            this.io.to(roomName).emit('broadcasterLeft');
        }
        let client = this.clients[connection.id];
        delete client.room;
    }

    transportMessage(data, connection) {
        let client = this.clients[connection.id];
        if (!client || !client.room) return from.emit('messageError', { code: 201, message: `You cannot send messages to a room you're not logged into.`});
        data.from = client.name;
        data.createdAt = new Date().valueOf();
        this.io.to(client.room).emit('message', data);
    }

    webRTCMessage(message, connection) {
        let client = this.clients[connection.id];
        if (!client || !client.room) return connection.emit('webrtc_messageError', `It doesn't seem that you are in a room`);
        if (!!message.data.target && !!this.clients[message.data.target]) {
            this.clients[message.data.target].emit('webrtc_message', message);
        }
    }

    initializeBroadcaster(from) {
        let client = this.clients[from.id];
        if (!client || !client.room) {
            from.emit('webrtc_messageError', { code: 201, message : `You cannot send messages unless you're logged in.`});
            return;
        }
        if (!!this.rooms[client.room].broadcaster && this.rooms[client.room].broadcaster !== from.id) {
            from.emit('webrtc_messageError', { code: 202, message : `That room already has a broadcaster` });
            return;
        } else this.rooms[client.room].broadcaster = client.id;
        from.emit('broadcasterConfirm');
        from.to(client.room).emit('broadcastStarted', from.id);
    }

    router(req, res) {
        if (req.url.substr(0, 2) === '..') req.url = '';

        if (req.url === '/' || req.url === '') req.url = '/index.html';
        if (req.url.includes('sslKeyPaths')) req.url = '/index.html';
        fs.readFile(`${__dirname}${req.url}`, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end(`Error loading ${req.url}`);
                return;
            }
            res.writeHead(200, { "Content-Type": mimeTypes[req.url.split('.').pop()] || 'text/plain' });
            res.end(data);
        });
    }

    createServer() {
        return new Promise((resolve, reject) => {
            this.app = https.createServer({
                key : fs.readFileSync(securePaths.key),
                cert : fs.readFileSync(securePaths.cert)
            }, this.router);
            resolve();
        });

    }

}

let myDemoServer = new WebRTCDemoServer();