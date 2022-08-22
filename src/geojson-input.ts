import { bbox, bboxPolygon, difference, lineString, union } from '@turf/turf';
import { GeoJSON, LatLng, LeafletMouseEvent, LeafletMouseEventHandlerFn } from 'leaflet';
import inputCss from './geojson-input.css?inline';
import GeoJSONMap from './geojson-map';

type Tool = 'pan' | 'add' | 'subtract';

export default class GeoJSONInput extends GeoJSONMap {
	static formAssociated = true;

	#internals: ElementInternals;
	protected toolbar: HTMLDivElement;
	protected inputLayer: GeoJSON;
	protected valueLayer: GeoJSON;

	get name(): string | undefined {
		return this.getAttribute('name') ?? undefined;
	}

	get value(): GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon> | null {
		return JSON.parse(this.getAttribute('value') ?? 'null');
	}

	set value(value) {
		if (value) {
			const stringValue = JSON.stringify(value);
			this.setAttribute('value', stringValue);
			this.#internals.setFormValue(stringValue);
		} else {
			this.removeAttribute('value');
		}
	}

	inputPoints = [] as [down: LatLng, moving: LatLng] | [];

	inputRectangle = null as GeoJSON.Feature<GeoJSON.Polygon> | null;

	get tool(): Tool {
		return (this.getAttribute('tool') as Tool) ?? 'pan';
	}

	set tool(value) {
		const panAndZoomToggle = value === 'pan' ? 'enable' : 'disable';
		this.map?.dragging[panAndZoomToggle]();
		this.map?.boxZoom[panAndZoomToggle]();

		this.toolbar.querySelectorAll('button[name="tool"]').forEach(button => {
			button.ariaPressed = String((button as HTMLButtonElement).value === value);
		});

		this.setAttribute('tool', value);
	}

	constructor() {
		super();

		this.#internals = this.attachInternals();
		this.#internals.setFormValue(this.value ? JSON.stringify(this.value) : null);

		this.mapContainer.insertAdjacentHTML('beforebegin', `
			<style>${inputCss}</style>

			<div id="toolbar">
				<div class="button-group">
					<button type="button" name="zoom" value="1">Zoom in</button>
					<button type="button" name="zoom" value="-1">Zoom out</button>
				</div>
				<div class="button-group">
					<button type="button" name="tool" value="pan" aria-pressed="true">Pan</button>
					<button type="button" name="tool" value="add" aria-pressed="false">Add</button>
					<button type="button" name="tool" value="subtract" aria-pressed="false">Subtract</button>
				</div>
			</div>
		`);

		this.toolbar = this.shadowRoot?.getElementById('toolbar') as HTMLDivElement;

		this.inputLayer = new GeoJSON(undefined, {
			style: { color: 'gray' },
		});

		this.valueLayer = new GeoJSON(this.value ?? undefined);
	}

	connectedCallback() {
		super.connectedCallback();

		this.map?.zoomControl.remove();
		this.map?.addLayer(this.inputLayer);
		this.map?.addLayer(this.valueLayer);

		this.map?.on('mousedown', this.handleMouseDown);
		this.toolbar.addEventListener('click', this.handleToolbarClick);
	}

	disconnectedCallback() {
		this.map?.off('mousedown', this.handleMouseDown);
		this.toolbar.removeEventListener('click', this.handleToolbarClick);

		super.disconnectedCallback();
	}

	handleToolbarClick = (event: MouseEvent) => {
		const button = (event.target as typeof this.toolbar).closest('button') as HTMLButtonElement | null;
		if (button?.name === 'zoom') {
			this.map?.zoomIn(parseFloat(button.value));
		} else if (button?.name === 'tool') {
			this.tool = button.value as Tool;
		}
	};

	handleMouseDown: LeafletMouseEventHandlerFn = event => {
		if (this.tool !== 'pan') {
			this.map?.on('mousemove', this.handleMouseMove);
			this.map?.on('mouseup', this.handleMouseUp);
			this.handleMouseMove(event);
		}
	};

	handleMouseMove: LeafletMouseEventHandlerFn = event => {
		event.originalEvent.preventDefault();
		this.handleDrag(event);
	};

	handleMouseUp: LeafletMouseEventHandlerFn = event => {
		this.map?.off('mousemove', this.handleMouseMove);
		this.map?.off('mouseup', this.handleMouseUp);
		this.handleDrag(event);
	};

	handleDrag(event: LeafletMouseEvent) {
		if (event.type === 'mousedown') {
			this.inputPoints = [event.latlng, event.latlng];
		} else {
			this.inputPoints[1] = event.latlng;
			const lngLats = this.inputPoints.map(point => [point.lng, point.lat]);
			const diagonal = lineString(lngLats);
			this.inputRectangle = bboxPolygon(bbox(diagonal));
			const operation = this.tool === 'add' ? union : difference;
			const newValue = this.value ? operation(this.value, this.inputRectangle) : this.inputRectangle;

			if (event.type === 'mousemove') {
				this.updateLayer(this.inputLayer, this.inputRectangle);
			} else if (event.type === 'mouseup' && this.inputRectangle) {
				this.inputPoints = [];
				this.inputRectangle = null;
				this.value = newValue;
				this.updateLayer(this.inputLayer, null);
				this.updateLayer(this.valueLayer, this.value);
				this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: this.value }));
			}
		}
	}

	updateLayer(layer: GeoJSON, data: GeoJSON.Feature | null) {
		layer.clearLayers();
		if (data) layer.addData(data);
	}
}
