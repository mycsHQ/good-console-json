'use strict';

// Load Modules

const Hoek = require('hoek');
const Moment = require('moment');
const Stream = require('stream');
const BuildSerialize = require('r7insight_node/lib/serialize');

const internals = {
    defaults: {
        format: 'YYMMDD/HHmmss.SSS',
        utc: true,
        color: true
    }
};

const serialize = BuildSerialize({});

internals.utility = {
    formatOutput(event, settings) {

        let timestamp = Moment(parseInt(event.timestamp, 10));

        if (settings.utc) {
            timestamp = timestamp.utc();
        }

        timestamp = timestamp.format(settings.format);

        const output = serialize(Object.assign({}, {
            timestamp,
            tags: event.tags
            // add event id information if available, typically for 'request' events
            // eventId: event.id
        }, event.data));

        return output + '\n';
    },

    formatMethod(method, settings) {

        const methodColors = {
            get: 32,
            delete: 31,
            put: 36,
            post: 33
        };

        let formattedMethod = method.toLowerCase();
        if (settings.color) {
            const color = methodColors[method.toLowerCase()] || 34;
            formattedMethod = `\x1b[1;${color}m${formattedMethod}\x1b[0m`;
        }

        return formattedMethod;
    },

    formatStatusCode(statusCode, settings) {

        let color;
        if (statusCode && settings.color) {
            color = 32;
            if (statusCode >= 500) {
                color = 31;
            }
            else if (statusCode >= 400) {
                color = 33;
            }
            else if (statusCode >= 300) {
                color = 36;
            }

            return `\x1b[${color}m${statusCode}\x1b[0m`;
        }

        return statusCode;
    },

    formatResponse(event, tags, settings) {

        const query = event.query || '';
        const method = internals.utility.formatMethod(event.method, settings);
        const statusCode = internals.utility.formatStatusCode(event.statusCode, settings) || '';

        // event, timestamp, id, instance, labels, method, path, query, responseTime,
        // statusCode, pid, httpVersion, source, remoteAddress, userAgent, referer, log
        // method, pid, error
        const output = {
            // eventInstance: event.instance,
            method,
            path: event.path,
            query,
            statusCode,
            responseTimeMs: event.responseTime
        };

        const response = {
            id: event.id,
            timestamp: event.timestamp,
            tags,
            data: output
        };

        return internals.utility.formatOutput(response, settings);
    },

    formatOps(event, tags, settings) {

        const memory = Math.round(event.proc.mem.rss / (1024 * 1024));
        const output = {
            memoryMb: memory,
            uptimeSeconds: event.proc.uptime,
            load: event.os.load
        };

        const ops = {
            timestamp: event.timestamp,
            tags,
            data: output
        };

        return internals.utility.formatOutput(ops, settings);
    },

    formatError(event, tags, settings) {

        const output = {
            message: event.error.message,
            stack: event.error.stack
        };

        const error = {
            id: event.id,
            timestamp: event.timestamp,
            tags,
            data: output
        };

        return internals.utility.formatOutput(error, settings);
    },

    formatDefault(event, tags, settings) {

        const output = {
            data: event.data
        };

        const defaults = {
            timestamp: event.timestamp,
            id: event.id,
            tags,
            data: output
        };

        return internals.utility.formatOutput(defaults, settings);
    }
};

class GoodConsole extends Stream.Transform {
    constructor(config) {

        super({ objectMode: true });

        config = config || {};
        this._settings = Hoek.applyToDefaults(internals.defaults, config);
    }

    _transform(data, enc, next) {

        const eventName = data.event;
        let tags = [];

        if (Array.isArray(data.tags)) {
            tags = data.tags.concat([]);
        }
        else if (data.tags) {
            tags = [data.tags];
        }

        tags.unshift(eventName);

        if (eventName === 'error' || data.error instanceof Error) {
            return next(null, internals.utility.formatError(data, tags, this._settings));
        }

        if (eventName === 'ops') {
            return next(null, internals.utility.formatOps(data, tags, this._settings));
        }

        if (eventName === 'response') {
            return next(null, internals.utility.formatResponse(data, tags, this._settings));
        }

        if (!data.data) {
            data.data = '(none)';
        }

        return next(null, internals.utility.formatDefault(data, tags, this._settings));
    }
}

module.exports = GoodConsole;
