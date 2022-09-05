import GeoJSONMap from './geojson-map';
import toolbarCss from './toolbar.css';

type Tool = 'pan' | 'select' | 'add' | 'subtract';

const MODIFIERS_KEYS = [' ', 'Meta', 'Shift', 'Alt'];

export default class GeoJSONMapWithTool extends GeoJSONMap {
	toolbar = document.createElement('div');
	toolWithoutKey: Tool | null = null;
	modifierKeysDown = new Set<KeyboardEvent['key']>();

	get tool(): Tool {
		return this.getAttribute('tool') as Tool ?? 'pan';
	}

	set tool(value) {
		const panAndZoomToggle = value === 'pan' ? 'enable' : 'disable';
		this.map.dragging[panAndZoomToggle]();
		this.map.boxZoom[panAndZoomToggle]();

		for (const button of this.toolbarButtons) {
			button.setAttribute('aria-pressed', String(button.value === value));
		}

		this.setAttribute('tool', value);
	}

	get toolbarButtons(): NodeListOf<HTMLButtonElement> {
		return this.toolbar.querySelectorAll('button[name="tool"]');
	}

	constructor() {
		super();
		this.handleGlobalKeyboardEvent = this.handleGlobalKeyboardEvent.bind(this);
		this.handleToolbarClick = this.handleToolbarClick.bind(this);

		this.map.zoomControl.remove();

		this.toolbar.id = 'toolbar';
		this.toolbar.innerHTML = `
			<style>${toolbarCss}</style>

			<div class="button-group">
				<button type="button" name="zoom" value="1"><big>+</big></button>
				<button type="button" name="zoom" value="-1"><big>&ndash;</big></button>
			</div>

			<div class="button-group">
				<button type="button" name="tool" value="pan" aria-pressed="true">
					<span>Pan</span>
					<span>␣</span>
				</button>
				<button type="button" name="tool" value="add" aria-pressed="false">
					<span>Add</span>
					<span>⇧</span>
				</button>
				<button type="button" name="tool" value="subtract" aria-pressed="false">
					<span>Subtract</span>
					<span>⌥</span>
				</button>
				<button type="button" name="tool" value="select" aria-pressed="false">
					<span>Select</span>
					<span>⌘</span>
				</button>
			</div>
		`;

		this.map.getContainer().insertAdjacentElement('beforebegin', this.toolbar);
	}

	connectedCallback() {
		super.connectedCallback();
		addEventListener('keydown', this.handleGlobalKeyboardEvent);
		addEventListener('keyup', this.handleGlobalKeyboardEvent);
		this.toolbar.addEventListener('click', this.handleToolbarClick);
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		removeEventListener('keydown', this.handleGlobalKeyboardEvent);
		removeEventListener('keyup', this.handleGlobalKeyboardEvent);
		this.toolbar.removeEventListener('click', this.handleToolbarClick);
	}

	handleGlobalKeyboardEvent(event: KeyboardEvent) {
		if (!MODIFIERS_KEYS.includes(event.key)) return;
		this.toolWithoutKey ??= this.tool;
		const addOrDelete = event.type === 'keydown' ? 'add' : 'delete';
		this.modifierKeysDown[addOrDelete](event.key);
		if (this.modifierKeysDown.has(' ')) this.tool = 'pan';
		if (this.modifierKeysDown.has('Meta')) this.tool = 'select';
		if (this.modifierKeysDown.has('Shift') && this.tool !== 'select') this.tool = 'add';
		if (this.modifierKeysDown.has('Alt')) this.tool = 'subtract';
		if (this.modifierKeysDown.size === 0) {
			this.tool = this.toolWithoutKey;
			this.toolWithoutKey = null;
		}
	}

	handleToolbarClick(event: MouseEvent) {
		const button = (event.target as typeof this.toolbar).closest('button');
		if (button instanceof HTMLButtonElement) {
			if (button.name === 'zoom') {
				this.map.zoomIn(parseFloat(button.value));
			} else if (button.name === 'tool') {
				this.tool = button.value as Tool;
			}
		}
		return button;
	};
}
