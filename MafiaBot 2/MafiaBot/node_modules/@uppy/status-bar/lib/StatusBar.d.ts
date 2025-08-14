import type { Body, DefinePluginOpts, Meta, State, Uppy } from '@uppy/core';
import { UIPlugin } from '@uppy/core';
import type { ComponentChild } from 'preact';
import type { StatusBarOptions } from './StatusBarOptions.js';
declare const defaultOptions: {
    hideUploadButton: false;
    hideRetryButton: false;
    hidePauseResumeButton: false;
    hideCancelButton: false;
    showProgressDetails: false;
    hideAfterFinish: true;
    doneButtonHandler: null;
};
/**
 * StatusBar: renders a status bar with upload/pause/resume/cancel/retry buttons,
 * progress percentage and time remaining.
 */
export default class StatusBar<M extends Meta, B extends Body> extends UIPlugin<DefinePluginOpts<StatusBarOptions, keyof typeof defaultOptions>, M, B> {
    #private;
    static VERSION: string;
    constructor(uppy: Uppy<M, B>, opts?: StatusBarOptions);
    startUpload: () => ReturnType<Uppy<M, B>["upload"]>;
    render(state: State<M, B>): ComponentChild;
    onMount(): void;
    install(): void;
    uninstall(): void;
}
export {};
//# sourceMappingURL=StatusBar.d.ts.map