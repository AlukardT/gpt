import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { UIPlugin } from '@uppy/core';
import { h } from 'preact';
import packageJson from '../package.json' with { type: 'json' };
import FadeIn from './FadeIn.js';
import TransitionGroup from './TransitionGroup.js';
/**
 * Informer
 * Shows rad message bubbles
 * used like this: `uppy.info('hello world', 'info', 5000)`
 * or for errors: `uppy.info('Error uploading img.jpg', 'error', 5000)`
 *
 */
export default class Informer extends UIPlugin {
    static VERSION = packageJson.version;
    constructor(uppy, opts) {
        super(uppy, opts);
        this.type = 'progressindicator';
        this.id = this.opts.id || 'Informer';
        this.title = 'Informer';
    }
    render = (state) => {
        return (_jsx("div", { className: "uppy uppy-Informer", children: _jsx(TransitionGroup, { children: state.info.map((info) => (_jsx(FadeIn, { children: _jsxs("p", { role: "alert", children: [info.message, ' ', info.details && (
                            // biome-ignore lint/a11y/useKeyWithClickEvents: ...
                            _jsx("span", { "aria-label": info.details, "data-microtip-position": "top-left", "data-microtip-size": "medium", role: "tooltip", onClick: () => alert(`${info.message} \n\n ${info.details}`), children: "?" }))] }) }, info.message))) }) }));
    };
    install() {
        const { target } = this.opts;
        if (target) {
            this.mount(target, this);
        }
    }
}
