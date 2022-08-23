import { bbox, bboxPolygon, difference, lineString, union } from '@turf/turf';
import { GeoJSON, LatLng, LeafletMouseEvent, LeafletMouseEventHandlerFn } from 'leaflet';
import inputCss from './geojson-input.css?inline';
import GeoJSONMap from './geojson-map';

type Tool = 'pan' | 'add' | 'subtract';

export default class GeoJSONInput extends GeoJSONMap {
	static formAssociated = true;
	#internals: ElementInternals;

	protected toolbar: HTMLDivElement;

	#inputLayer: GeoJSON;
	#valueLayer: GeoJSON;

	inputPoints = [] as [down: LatLng, moving: LatLng] | [];
	dragRectangle = null as GeoJSON.Feature<GeoJSON.Polygon> | null;

	get name(): string | undefined {
		return this.getAttribute('name') ?? undefined;
	}

	set name(value) {
		if (value) {
			this.setAttribute('name', value);
		} else {
			this.removeAttribute('name');
		}
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
			this.#internals.setFormValue(null);
		}
		const subtractButton = this.toolbar.querySelector('button[name="tool"][value="subtract"]') as HTMLButtonElement;
		subtractButton.disabled = !value;
	}

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

		this.#inputLayer = new GeoJSON(undefined, {
			style: { color: 'gray', interactive: false, weight: 1 },
		});

		this.#valueLayer = new GeoJSON(this.value ?? undefined, {
			style: { color: 'blue', interactive: false, weight: 1 },
		});
	}

	connectedCallback() {
		super.connectedCallback();

		this.value = this.value;

		this.map?.zoomControl.remove();
		this.map?.addLayer(this.#inputLayer);
		this.map?.addLayer(this.#valueLayer);

		this.toolbar.addEventListener('click', this.handleToolbarClick);
		this.map?.on('mousedown', this.handleMapMouseDown);
	}

	disconnectedCallback() {
		this.toolbar.removeEventListener('click', this.handleToolbarClick);
		this.map?.off('mousedown', this.handleMapMouseDown);

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

	handleMapMouseDown: LeafletMouseEventHandlerFn = event => {
		if (this.tool !== 'pan') {
			this.map?.on('mousemove', this.handlemapMouseMove);
			this.map?.on('mouseup', this.handleMapMouseUp);
			this.handlemapMouseMove(event);
		}
	};

	handlemapMouseMove: LeafletMouseEventHandlerFn = event => {
		event.originalEvent.preventDefault();
		this.processMapDragging(event);
	};

	handleMapMouseUp: LeafletMouseEventHandlerFn = event => {
		this.map?.off('mousemove', this.handlemapMouseMove);
		this.map?.off('mouseup', this.handleMapMouseUp);
		this.processMapDragging(event);
	};

	processMapDragging(event: LeafletMouseEvent) {
		if (event.type === 'mousedown') {
			this.inputPoints = [event.latlng, event.latlng];
		} else {
			this.inputPoints[1] = event.latlng;
			const lngLats = this.inputPoints.map(point => [point.lng, point.lat]);
			const diagonal = lineString(lngLats);
			this.dragRectangle = bboxPolygon(bbox(diagonal));

			if (event.type === 'mousemove') {
				this.updateLayer(this.#inputLayer, this.dragRectangle);
			} else if (event.type === 'mouseup' && this.dragRectangle) {
				const operation = this.tool === 'add' ? union : difference;
				this.value = this.value ? operation(this.value, this.dragRectangle) : this.dragRectangle;
				if (!this.value && this.tool === 'subtract') {
					this.tool = 'pan';
				}
				this.updateLayer(this.#inputLayer, null);
				this.updateLayer(this.#valueLayer, this.value);
				this.inputPoints = [];
				this.dragRectangle = null;
				this.dispatchEvent(new CustomEvent('change', { bubbles: true }));
			}
		}
	}

	updateLayer(layer: GeoJSON, data: GeoJSON.Feature | null) {
		layer.clearLayers();
		if (data) layer.addData(data);
	}
}
