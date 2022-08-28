import { bbox, bboxPolygon, difference, featureCollection, lineString } from '@turf/turf';
import { GeoJSON, LatLng, LeafletMouseEvent, LeafletMouseEventHandlerFn } from 'leaflet';
import inputCss from './geojson-input.css?inline';
import GeoJSONMap from './geojson-map';
import PolygonLayer from './polygon-layer';

type NonNullPolygonLayerFeature = NonNullable<InstanceType<typeof PolygonLayer>['feature']>;

type Tool = 'pan' | 'add' | 'subtract';

customElements.define('geojson-input-internal-polygon-layer', class extends PolygonLayer {});

export default class GeoJSONInput extends GeoJSONMap {
	static formAssociated = true;
	#internals: ElementInternals;

	toolbar: HTMLDivElement;

	#inputLayer: GeoJSON;

	inputPoints = [] as [down: LatLng, moving: LatLng] | [];

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

	get value(): GeoJSON.Feature | GeoJSON.FeatureCollection | null {
		const features = this.descendantPolygons
			.map(polygon => polygon.feature)
			.filter(Boolean) as NonNullPolygonLayerFeature[];

		if (features.length === 0) {
			return null;
		} else if (features.length === 1) {
			return features[0];
		} else {
			return featureCollection(features);
		}
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

		// const subtractButton = this.toolbar.querySelector('button[name="tool"][value="subtract"]') as HTMLButtonElement;
		// subtractButton.disabled = !value;

		this.dispatchEvent(new CustomEvent('change', { bubbles: true }));
	}

	get tool(): Tool {
		return (this.getAttribute('tool') as Tool) ?? 'pan';
	}

	set tool(value) {
		const panAndZoomToggle = value === 'pan' ? 'enable' : 'disable';
		this.map.dragging[panAndZoomToggle]();
		this.map.boxZoom[panAndZoomToggle]();

		this.toolbar.querySelectorAll('button[name="tool"]').forEach(button => {
			button.ariaPressed = String((button as HTMLButtonElement).value === value);
		});

		this.setAttribute('tool', value);
	}

	get descendantPolygons(): PolygonLayer[] {
		const descendants = [...this.querySelectorAll('*'), ...this.shadowRoot!.querySelectorAll('*')];
		return descendants.filter(element => element instanceof PolygonLayer) as PolygonLayer[];
	}

	constructor() {
		super();

		this.#internals = this.attachInternals();

		this.map.zoomControl.remove();

		this.map.getContainer().insertAdjacentHTML('beforebegin', `
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

				<div class="button-group">
					<button type="button" name="import" value="geojson" aria-pressed="true">GeoJSON</button>
				</div>
			</div>
		`);

		this.toolbar = this.shadowRoot?.getElementById('toolbar') as HTMLDivElement;

		this.#inputLayer = new GeoJSON(undefined, {
			style: { color: 'gray', interactive: false, weight: 1 },
		});

		this.map.addLayer(this.#inputLayer);

	}

	connectedCallback() {
		super.connectedCallback();
		console.log('Input connected');

		this.value = this.value;

		this.toolbar.addEventListener('click', this.handleToolbarClick);
		this.map.on('mousedown', this.handleMapMouseDown);
	}

	disconnectedCallback() {
		this.toolbar.removeEventListener('click', this.handleToolbarClick);
		this.map.off('mousedown', this.handleMapMouseDown);

		super.disconnectedCallback();
	}

	handleToolbarClick = (event: MouseEvent) => {
		const button = (event.target as typeof this.toolbar).closest('button');
		if (button instanceof HTMLButtonElement) {
			if (button.name === 'zoom') {
				this.map.zoomIn(parseFloat(button.value));
			} else if (button.name === 'tool') {
				this.tool = button.value as Tool;
			} else if (button.name === 'import') {
				if (button.value === 'geojson') {
					try {
						const geojson = JSON.parse(prompt('Paste in a GeoJSON feature') || 'null');
						this.value = geojson;
					} catch (error) {
						alert('Invalid GeoJSON');
					}
				}
			}
		}
	};

	handleMapMouseDown: LeafletMouseEventHandlerFn = event => {
		if (event.originalEvent.defaultPrevented) return;
		if (this.tool !== 'pan') {
			this.map.on('mousemove', this.handleMapMouseMove);
			this.map.on('mouseup', this.handleMapMouseUp);
			this.handleMapMouseMove(event);
		}
	};

	handleMapMouseMove: LeafletMouseEventHandlerFn = event => {
		event.originalEvent.preventDefault();
		this.processMapDragging(event);
	};

	handleMapMouseUp: LeafletMouseEventHandlerFn = event => {
		this.map.off('mousemove', this.handleMapMouseMove);
		this.map.off('mouseup', this.handleMapMouseUp);
		this.processMapDragging(event);
	};

	processMapDragging(event: LeafletMouseEvent) {
		if (event.type === 'mousedown') {
			this.inputPoints = [event.latlng, event.latlng];
		} else {
			this.inputPoints[1] = event.latlng;
			const lngLats = this.inputPoints.map(point => [point.lng, point.lat]);
			const diagonal = lineString(lngLats);
			const rectangle = bboxPolygon(bbox(diagonal));

			if (event.type === 'mousemove') {
				this.updateInputLayer(this.#inputLayer, rectangle);
			} else if (event.type === 'mouseup' && rectangle) {
				this.updateInputLayer(this.#inputLayer, null);
				this.applyInput(rectangle, this.tool);
				this.inputPoints = [];
			}
		}
	}

	updateInputLayer(layer: GeoJSON, data: GeoJSON.Feature | null) {
		layer.clearLayers();
		if (data) layer.addData(data);
	}

	applyInput(rectangle: GeoJSON.Feature<GeoJSON.Polygon>, tool: Tool) {
		if (tool === 'add') {
			const newPolygon = new PolygonLayer();
			newPolygon.feature = rectangle;
			this.shadowRoot!.append(newPolygon);
		} else if (tool === 'subtract') {
			for (const polygon of this.descendantPolygons) {
				if (polygon.feature) {
					const subtracted = difference(polygon.feature, rectangle);
					if (subtracted) {
						polygon.feature = subtracted;
					} else {
						polygon.remove();
					}
				}
			}
		}
	}
}
