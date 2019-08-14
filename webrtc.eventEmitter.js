const _events = Symbol('events'),
    _ready = Symbol('ready');

export class EventEmitter {

    constructor() {
        
    }
    
    on(trigger, fn, once = false) {
        if (typeof fn != 'function') throw new Error(`Invalid Listener: ${trigger}. Must be a function`);
        if (trigger === 'ready' && !!this[_ready]) {
            fn();
            return;
        }
        if (!this[_events]) this[_events] = {};
        if (!this[_events][trigger]) this[_events][trigger] = [];
        
        this[_events][trigger].push({
            listener: fn,
            once: !!once
        });
    }

    once(trigger, fn) { 
        this.on(trigger, fn, true);
    }

    off(trigger, fn) {
        if (!this[_events] || !this[_events][trigger]) return;
        this[_events][trigger] = this[_events][trigger].filter(evt => evt.listener !== fn);
    }

    offAll(trigger) {
        this[_events][trigger] = [];
    }

    emit(trigger, data) {
        return new Promise((resolve, reject) => {
            if (!this[_events] || !this[_events][trigger]) return;
            this[_events][trigger].forEach((evt, i) => {
                evt.listener(data);
                if (evt.once) this.off(trigger, evt.listener);
            });
            resolve();
        });
    }

    addEventListener(trigger, fn) { return this.on(trigger, fn); }
    addListener(trigger, fn) { return this.on(trigger, fn); }
    removeEventListener(trigger, fn) { return this.off(trigger, fn); }
    removeListener(trigger, fn) { return this.off(trigger, fn); }
    removeAllListeners(trigger) { return this.offAll(trigger); }

    ready() {
        this[_ready] = true;
        return this.emit('ready');
    }

}

export { EventEmitter as default };