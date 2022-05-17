/* eslint-disable */
export class DebugTimer {

    private startTime;
    private laps: DebugLap[];
    private currentLap;
    private complete: boolean;

    private static instance: DebugTimer;

    private constructor() { }

    public static getInstance(): DebugTimer {
        if (!this.instance) {
            this.instance = new DebugTimer();
        }

        return this.instance;
    }

    public start(): void {
        this.complete = false;
        this.startTime = Date.now();
        this.laps = [];
        this.currentLap = {
            name: 'Timer Start',
            start: this.startTime
        }
    }

    public lap(name: string): void {
        if (this.complete) throw new Error('Timer is complete');

        const curr = Date.now();

        // Close previous lap
        this.laps.push(this.buildLap(curr));

        // New lap
        this.currentLap = {
            name,
            start: curr
        }
    }

    public stop(): DebugLap[] {
        this.lap('End');

        const curr = Date.now();

        this.complete = true;

        // Close previous lap
        this.laps.push(this.buildLap(curr))

        return this.laps;
    }

    private buildLap(curr: number): DebugLap {
        return {
            ...this.currentLap,
            end: curr,
            total: this.msToTime(curr - this.currentLap.start),
            accumulated: this.msToTime(curr - this.startTime)
        };
    }

    private msToTime(s: number): string {
        // Pad to 2 or 3 digits, default is 2
        var pad = (n, z = 2) => ('00' + n).slice(-z);
        return pad(s / 3.6e6 | 0) + ':' + pad((s % 3.6e6) / 6e4 | 0) + ':' + pad((s % 6e4) / 1000 | 0) + '.' + pad(s % 1000, 3);
    }
}

interface DebugLap {
    name: string,
    start: number,
    end?: number,
    total?: string,
    accumulated?: string
}