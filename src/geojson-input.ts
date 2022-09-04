import { difference, getCoords } from '@turf/turf';
import { FeatureGroup, GeoJSON, LatLng, LatLngBounds, LeafletKeyboardEventHandlerFn, LeafletMouseEvent, LeafletMouseEventHandlerFn, Rectangle } from 'leaflet';
import { CornerMarker, EditablePolygon } from './editable-polygon';
import inputCss from './geojson-input.css';
import GeoJSONMap from './geojson-map';

type Value = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>
	| GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

type Tool = 'pan' | 'select' | 'add' | 'subtract';

const MODIFIERS_KEYS = [' ', 'Meta', 'Shift', 'Alt'];

export default class GeoJSONInput extends GeoJSONMap {
	static formAssociated = true;
	internals: ElementInternals;

	toolbar: HTMLDivElement;
	toolWithoutKey: Tool | null = null;
	modifierKeysDown = new Set<KeyboardEvent['key']>();

	inputStart: LeafletMouseEvent | null = null;
	inputDragCoords: LatLng | null = null;
	inputRect = new Rectangle([[0, 0], [0, 0]], { color: 'gray', interactive: false });
	valuePolygons = new FeatureGroup<EditablePolygon>();

	undoStack: (Value | null)[] = [];
	redoStack: (Value | null)[] = [];

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

	get value(): Value | null {
		return JSON.parse(this.getAttribute('value') ?? 'null');
	}

	set value(value) {
		const stringValue = JSON.stringify(value);
		if (this.getAttribute('value') !== stringValue) {
			this.valuePolygons.clearLayers();
			if (value) {
				const polygons = this.featureToPolygons(value);
				polygons.forEach(p => this.valuePolygons.addLayer(p));
				this.setAttribute('value', stringValue);
			} else {
				this.removeAttribute('value');
			}
		}
		this.internals.setFormValue(this.getAttribute('value') ?? null);
		this.dispatchEvent(new CustomEvent('change', { bubbles: true }));
	}

	get tool(): Tool {
		return this.getAttribute('tool') as Tool ?? 'pan';
	}

	set tool(value) {
		const panAndZoomToggle = value === 'pan' ? 'enable' : 'disable';
		this.map.dragging[panAndZoomToggle]();
		this.map.boxZoom[panAndZoomToggle]();

		this.inputRect.setStyle({
			dashArray: value === 'select' ? [4, 8] : undefined,
			fill: value !== 'select',
		});

		const buttons: NodeListOf<HTMLButtonElement> = this.toolbar.querySelectorAll('button[name="tool"]');
		for (const button of buttons) {
			button.setAttribute('aria-pressed', String(button.value === value));
		}

		this.setAttribute('tool', value);
	}

	get selectedCorners() {
		const polygons = this.valuePolygons.getLayers() as EditablePolygon[];
		const allCorners = polygons.map(p => p.corners.getLayers()).flat() as CornerMarker[];
		return allCorners.filter(c => c.selected);
	}

	constructor() {
		super();
		this.internals = this.attachInternals();

		this.map.zoomControl.remove();

		this.map.getContainer().insertAdjacentHTML('beforebegin', `
			<style>${inputCss}</style>

			<div id="toolbar">
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

				<div class="button-group">
					<button type="button" name="import" value="geojson" aria-pressed="true">GeoJSON…</button>
				</div>
			</div>
		`);

		this.toolbar = this.shadowRoot?.getElementById('toolbar') as HTMLDivElement;

		this.map.addLayer(this.valuePolygons);
	}

	connectedCallback() {
		super.connectedCallback();
		addEventListener('keydown', this.handleGlobalKeyboardEvent);
		addEventListener('keyup', this.handleGlobalKeyboardEvent);
		this.toolbar.addEventListener('click', this.handleToolbarClick);
		this.map.on('mousedown', this.handleMapMouseDown);
		this.map.on('keydown', this.handleMapKeydown);
		this.value = this.value;
	}

	disconnectedCallback() {
		removeEventListener('keydown', this.handleGlobalKeyboardEvent);
		removeEventListener('keyup', this.handleGlobalKeyboardEvent);
		this.toolbar.removeEventListener('click', this.handleToolbarClick);
		this.map.off('mousedown', this.handleMapMouseDown);
		this.map.off('keydown', this.handleMapKeydown);
		super.disconnectedCallback();
	}

	handleGlobalKeyboardEvent = (event: KeyboardEvent) => {
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

	handleToolbarClick = (event: MouseEvent) => {
		const button = (event.target as typeof this.toolbar).closest('button');
		if (button instanceof HTMLButtonElement) {
			if (button.name === 'zoom') {
				this.map.zoomIn(parseFloat(button.value));
			} else if (button.name === 'tool') {
				this.tool = button.value as Tool;
			} else if (button.name === 'import') {
				if (button.value === 'geojson') {
					this.importGeoJSON();
				}
			}
		}
	};

	handleMapMouseDown: LeafletMouseEventHandlerFn = event => {
		if (event.originalEvent.defaultPrevented) return;
		event.originalEvent.preventDefault();

		this.inputStart = event;

		const fromPolygon = event.sourceTarget instanceof EditablePolygon && !['select', 'subtract'].includes(this.tool);
		const fromCorner = event.sourceTarget instanceof CornerMarker;

		if (fromPolygon) {
			const polygonCorners = event.sourceTarget.corners.getLayers() as CornerMarker[];
			const selectingPolygon = !polygonCorners.every(c => this.selectedCorners.includes(c));
			this.selectedCorners.forEach(c => c.selected = false);
			polygonCorners.forEach(c => c.selected = true);
			if (selectingPolygon) {
				this.inputDragCoords = event.latlng;
			}
		}

		if (fromCorner) {
			const alreadySelected = this.selectedCorners.includes(event.sourceTarget);
			if (!alreadySelected && !event.originalEvent.shiftKey) {
				this.selectedCorners.forEach(c => c.selected = false);
			}
			event.sourceTarget.selected = true;
			if (event.originalEvent.shiftKey) {
				this.inputDragCoords = event.latlng;
				if (alreadySelected) {
					event.sourceTarget.selected = false;
					return;
				}
			}
		}

		const fromSelectedCorner = fromCorner && this.selectedCorners.includes(event.sourceTarget);

		if (fromPolygon || fromSelectedCorner) {
			this.map.dragging.disable();
			addEventListener('pointermove', this.handleCornerDrag);
			addEventListener('pointerup', this.handleCornerRelease);
		} else if (this.tool !== 'pan') {
			addEventListener('pointermove', this.handleMapDrag);
			addEventListener('pointerup', this.handleMapRelease);
		}
	};

	handleCornerDrag = (event: PointerEvent) => {
		const latlng = this.map.mouseEventToLatLng(event);
		if (this.inputDragCoords) {
			const latDelta = latlng.lat - this.inputDragCoords.lat;
			const lngDelta = latlng.lng - this.inputDragCoords.lng;
			this.selectedCorners.forEach(corner => {
				const cornerLatlng = corner.getLatLng();
				corner.setLatLng([cornerLatlng.lat + latDelta, cornerLatlng.lng + lngDelta]);
			});
		}
		this.inputDragCoords = latlng;
	}

	handleCornerRelease = () => {
		removeEventListener('pointermove', this.handleCornerDrag);
		removeEventListener('pointerup', this.handleCornerRelease);

		if (!this.inputStart) return;

		const fromPolygon = this.inputStart.sourceTarget instanceof EditablePolygon;
		if (fromPolygon && !this.inputDragCoords) {
			this.selectedCorners.forEach(c => c.selected = false);
		}

		this.inputStart = null;
		this.inputDragCoords = null;
		this.syncValue();
	}

	handleMapDrag = (event: PointerEvent) => {
		if (!this.inputStart) return;
		if (!this.map.hasLayer(this.inputRect)) {
			this.map.addLayer(this.inputRect);
		}
		const latlng = this.map.mouseEventToLatLng(event);
		this.inputRect.setBounds(new LatLngBounds(this.inputStart.latlng, latlng));

		if (this.tool === 'select') {
			if (!event.shiftKey) {
				this.selectedCorners.forEach(c => c.selected = false);
			}
			this.map.eachLayer(layer => {
				if (layer instanceof CornerMarker) {
					const contained = this.inputRect.getBounds().contains(layer.getLatLng());
					if (contained) {
						layer.selected = true;
					}
				}
			});
		}
	};

	handleMapRelease = () => {
		removeEventListener('pointermove', this.handleMapDrag);
		removeEventListener('pointerup', this.handleMapRelease);
		this.inputRect.remove();

		if (!this.inputStart) return;

		if (this.tool === 'add') {
			const latLngs = this.inputRect.getLatLngs();
			const newPolygon = new EditablePolygon(latLngs);
			this.valuePolygons.addLayer(newPolygon);
			this.syncValue();
		}

		if (this.tool === 'subtract') {
			const inputFeature = this.inputRect.toGeoJSON();
			const polygons = this.valuePolygons.getLayers() as EditablePolygon[];
			polygons.forEach(polygon => {
				this.valuePolygons.removeLayer(polygon);
				const valueFeature = polygon.toGeoJSON();
				const result = difference(valueFeature, inputFeature);
				if (result) {
					const newPolygons = this.featureToPolygons(result);
					newPolygons.forEach(p => this.valuePolygons.addLayer(p));
				} else {
					this.valuePolygons.removeLayer(polygon);
				}
			});
			this.syncValue();
		}

		this.inputStart = null;
		this.inputDragCoords = null;
	};

	handleMapKeydown: LeafletKeyboardEventHandlerFn = event => {
		if (event.originalEvent.key === 'Escape' && this.inputStart) {
			this.inputStart = null;
			this.inputDragCoords = null;
			dispatchEvent(new CustomEvent('pointerup', { bubbles: true }));
		}

		if (['Backspace', 'Delete'].includes(event.originalEvent.key)) {
			const polygons = this.valuePolygons.getLayers() as EditablePolygon[];
			polygons.forEach(polygon => {
				this.selectedCorners.forEach(c => polygon.removeCorner(c));
				if (polygon.corners.getLayers().length < 3) {
					this.valuePolygons.removeLayer(polygon);
				}
			});
			this.syncValue();
		}

		if (event.originalEvent.key === 'z' && this.modifierKeysDown.has('Meta')) {
			if (this.modifierKeysDown.has('Shift')) {
				if (this.redoStack.length !== 0) {
					this.undoStack.push(this.value);
					this.value = this.redoStack.pop()!;
				}
			} else if (this.undoStack.length !== 0) {
				this.redoStack.push(this.value);
				this.value = this.undoStack.pop()!;
			}
		}
	}

	importGeoJSON() {
		try {
			const geojson = prompt('Paste in a GeoJSON feature')?.trim();
			if (geojson) {
				this.undoStack.push(this.value);
				this.value = JSON.parse(geojson);
			}
		} catch (error) {
			alert('Invalid GeoJSON');
		}
	}

	featureToPolygons(feature: Value): EditablePolygon[] {
		if (feature.type === 'FeatureCollection') {
			return feature.features.map(f => this.featureToPolygons(f)).flat();
		}

		const coords = getCoords<GeoJSON.Polygon | GeoJSON.MultiPolygon>(feature);

		try {
			const latLngs = GeoJSON.coordsToLatLngs(coords, 1);
			return [new EditablePolygon(latLngs)];
		} catch (_error) {
			return coords.map(part => {
				const latLngs = GeoJSON.coordsToLatLngs(part, 1);
				return new EditablePolygon(latLngs);
			});
		}
	}

	syncValue() {
		this.undoStack.push(this.value);

		let value: typeof this.value = this.valuePolygons.toGeoJSON() as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
		if (value.features.length === 0) {
			value = null;
		} else if (value.features.length === 1) {
			value = value.features[0];
		}

		if (value) {
			// Pre-set the attribute to prevent redrawing.
			const stringValue = JSON.stringify(value);
			this.setAttribute('value', stringValue);
		}

		this.value = value;
	}
}
