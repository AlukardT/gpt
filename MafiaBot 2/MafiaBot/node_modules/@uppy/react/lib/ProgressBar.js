import ProgressBarPlugin, {} from '@uppy/progress-bar';
import { Component, createElement as h } from 'react';
import getHTMLProps from './getHTMLProps.js';
import nonHtmlPropsHaveChanged from './nonHtmlPropsHaveChanged.js';
/**
 * React component that renders a progress bar at the top of the page.
 */
class ProgressBar extends Component {
    container;
    plugin;
    componentDidMount() {
        this.installPlugin();
    }
    componentDidUpdate(prevProps) {
        if (prevProps.uppy !== this.props.uppy) {
            this.uninstallPlugin(prevProps);
            this.installPlugin();
        }
        else if (nonHtmlPropsHaveChanged(this.props, prevProps)) {
            const { uppy, ...options } = { ...this.props, target: this.container };
            this.plugin.setOptions(options);
        }
    }
    componentWillUnmount() {
        this.uninstallPlugin();
    }
    installPlugin() {
        const { uppy, fixed, hideAfterFinish, id } = this.props;
        const options = {
            id: id || 'ProgressBar',
            fixed,
            hideAfterFinish,
            target: this.container,
        };
        uppy.use(ProgressBarPlugin, options);
        this.plugin = uppy.getPlugin(options.id);
    }
    uninstallPlugin(props = this.props) {
        const { uppy } = props;
        uppy.removePlugin(this.plugin);
    }
    render() {
        return h('div', {
            className: 'uppy-Container',
            ref: (container) => {
                this.container = container;
            },
            ...getHTMLProps(this.props),
        });
    }
}
export default ProgressBar;
