import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { UIPlugin } from '@uppy/core';
import toArray from '@uppy/utils/lib/toArray';
// biome-ignore lint/style/useImportType: h is not a type
import { h } from 'preact';
import packageJson from '../package.json' with { type: 'json' };
import locale from './locale.js';
const defaultOptions = {
    pretty: true,
    inputName: 'files[]',
};
export default class FileInput extends UIPlugin {
    static VERSION = packageJson.version;
    input = null;
    constructor(uppy, opts) {
        super(uppy, { ...defaultOptions, ...opts });
        this.id = this.opts.id || 'FileInput';
        this.title = 'File Input';
        this.type = 'acquirer';
        this.defaultLocale = locale;
        this.i18nInit();
        this.render = this.render.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleClick = this.handleClick.bind(this);
    }
    addFiles(files) {
        const descriptors = files.map((file) => ({
            source: this.id,
            name: file.name,
            type: file.type,
            data: file,
        }));
        try {
            this.uppy.addFiles(descriptors);
        }
        catch (err) {
            this.uppy.log(err);
        }
    }
    handleInputChange(event) {
        this.uppy.log('[FileInput] Something selected through input...');
        const files = toArray(event.currentTarget.files || []);
        this.addFiles(files);
        // Clear the input so that Chrome can detect file section when the same file is repeatedly selected
        // (see https://github.com/transloadit/uppy/issues/768#issuecomment-2264902758)
        event.currentTarget.value = '';
    }
    handleClick() {
        this.input.click();
    }
    render() {
        /* http://tympanus.net/codrops/2015/09/15/styling-customizing-file-inputs-smart-way/ */
        const hiddenInputStyle = {
            width: '0.1px',
            height: '0.1px',
            opacity: 0,
            overflow: 'hidden',
            position: 'absolute',
            zIndex: -1,
        };
        const { restrictions } = this.uppy.opts;
        return (_jsxs("div", { className: "uppy-FileInput-container", children: [_jsx("input", { className: "uppy-FileInput-input", style: this.opts.pretty ? hiddenInputStyle : undefined, type: "file", name: this.opts.inputName, onChange: this.handleInputChange, multiple: restrictions.maxNumberOfFiles !== 1, accept: restrictions.allowedFileTypes?.join(', '), ref: (input) => {
                        this.input = input;
                    } }), this.opts.pretty && (_jsx("button", { className: "uppy-FileInput-btn", type: "button", onClick: this.handleClick, children: this.i18n('chooseFiles') }))] }));
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
