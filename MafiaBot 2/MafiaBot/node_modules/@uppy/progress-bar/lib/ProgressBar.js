import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { UIPlugin } from '@uppy/core';
import { h } from 'preact';
import packageJson from '../package.json' with { type: 'json' };
// set default options, must kept in sync with @uppy/react/src/ProgressBar.js
const defaultOptions = {
    fixed: false,
    hideAfterFinish: true,
};
/**
 * Progress bar
 *
 */
export default class ProgressBar extends UIPlugin {
    static VERSION = packageJson.version;
    constructor(uppy, opts) {
        super(uppy, { ...defaultOptions, ...opts });
        this.id = this.opts.id || 'ProgressBar';
        this.title = 'Progress Bar';
        this.type = 'progressindicator';
        this.render = this.render.bind(this);
    }
    render(state) {
        const { totalProgress } = state;
        // before starting and after finish should be hidden if specified in the options
        const isHidden = (totalProgress === 0 || totalProgress === 100) &&
            this.opts.hideAfterFinish;
        return (_jsxs("div", { className: "uppy uppy-ProgressBar", style: { position: this.opts.fixed ? 'fixed' : 'initial' }, "aria-hidden": isHidden, children: [_jsx("div", { className: "uppy-ProgressBar-inner", style: { width: `${totalProgress}%` } }), _jsx("div", { className: "uppy-ProgressBar-percentage", children: totalProgress })] }));
    }
    install() {
        const { target } = this.opts;
        if (target) {
            this.mount(target, this);
        }
    }
    uninstall() {
        this.unmount();
    }
}
