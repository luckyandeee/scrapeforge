import { EventEmitter } from 'events';

export const systemEvents = new EventEmitter();

export const broadcast = (level: 'info' | 'success' | 'warning' | 'error', message: string, source: string = 'System') => {
    const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : level === 'warning' ? '⚠️' : '➡️';
    console.log(`${prefix} [${source}] ${message}`);

    systemEvents.emit('stream', {
        timestamp: new Date().toISOString(),
        level,
        source,
        message
    });
};