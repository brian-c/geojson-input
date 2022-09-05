import { difference, getCoords } from '@turf/turf';
import { FeatureGroup, GeoJSON, LatLng, LatLngBounds, LeafletKeyboardEvent, LeafletMouseEvent, Rectangle } from 'leaflet';
import { CornerMarker, EditablePolygon } from './editable-polygon';
import inputCss from './geojson-input.css';
import GeoJSONMapWithTool from './with-tool';

type Value = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>
	| GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

export default class GeoJSONInput extends GeoJSONMapWithTool {
	static formAssociated = true;
	internals: ElementInternals;

	shp: any;

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

	get tool() {
		return super.tool;
	}

	set tool(value) {
		super.tool = value;
		this.inputRect.setStyle({
			dashArray: value === 'select' ? [4, 8] : undefined,
			fill: value !== 'select',
		});
	}

	get selectedCorners() {
		const polygons = this.valuePolygons.getLayers() as EditablePolygon[];
		const allCorners = polygons.map(p => p.corners.getLayers()).flat() as CornerMarker[];
		return allCorners.filter(c => c.selected);
	}

	constructor() {
		super();
		this.handleCornerDrag = this.handleCornerDrag.bind(this);
		this.handleCornerRelease = this.handleCornerRelease.bind(this);
		this.handleMapDrag = this.handleMapDrag.bind(this);
		this.handleMapRelease = this.handleMapRelease.bind(this);

		this.internals = this.attachInternals();

		this.map.getContainer().insertAdjacentHTML('beforebegin', `
			<style>${inputCss}</style>
		`);

		this.toolbar.insertAdjacentHTML('beforeend', `
			<div class="button-group">
				<button type="button" name="import" value="geojson">Paste…</button>
				<button type="button" name="import" value="shapefile">Import…</button>
			</div>
		`);

		this.map.addLayer(this.valuePolygons);
	}

	connectedCallback() {
		super.connectedCallback();
		this.map.on('mousedown', this.handleMapMouseDown, this);
		this.map.on('keydown', this.handleMapKeydown, this);
		this.value = this.value;
	}

	disconnectedCallback() {
		this.map.off('mousedown', this.handleMapMouseDown, this);
		this.map.off('keydown', this.handleMapKeydown, this);
		super.disconnectedCallback();
	}

	handleToolbarClick(event: MouseEvent) {
		const button = super.handleToolbarClick(event);
		if (button instanceof HTMLButtonElement && button.name === 'import') {
			if (button.value === 'geojson') {
				this.importGeoJSON();
			} else if (button.value === 'shapefile') {
				this.importShapefile();
			}
		}
		return button;
	};

	handleMapMouseDown(event: LeafletMouseEvent) {
		if (event.originalEvent.defaultPrevented) return;
		event.originalEvent.preventDefault();

		this.inputStart = event;

		const modifiedTool = (this.tool === 'subtract' && this.modifierKeysDown.has('Alt'))
		 || this.tool === 'add' && this.modifierKeysDown.has('Shift');

		const fromPolygon = event.sourceTarget instanceof EditablePolygon && !modifiedTool;
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

	handleCornerDrag(event: PointerEvent) {
		const latlng = this.map.mouseEventToLatLng(event);
		if (this.inputDragCoords) {
			const latDelta = latlng.lat - this.inputDragCoords.lat;
			const lngDelta = latlng.lng - this.inputDragCoords.lng;
			this.selectedCorners.forEach(corner => {
				corner.translateLatLng(latDelta, lngDelta);
			});
		}
		this.inputDragCoords = latlng;
	}

	handleCornerRelease() {
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

	handleMapDrag (event: PointerEvent) {
		if (!this.inputStart) return;

		if (!this.map.hasLayer(this.inputRect)) {
			this.map.addLayer(this.inputRect);
		}

		this.inputDragCoords = this.map.mouseEventToLatLng(event);
		this.inputRect.setBounds(new LatLngBounds(this.inputStart.latlng, this.inputDragCoords));

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

	handleMapRelease() {
		removeEventListener('pointermove', this.handleMapDrag);
		removeEventListener('pointerup', this.handleMapRelease);
		this.inputRect.remove();

		if (!this.inputStart) return;

		if (this.tool === 'select') {
			if (!this.inputDragCoords) {
				this.selectedCorners.forEach(c => c.selected = false);
			}
		}

		if (this.tool === 'add') {
			if (!this.inputDragCoords) return;
			const latLngs = this.inputRect.getLatLngs();
			const newPolygon = new EditablePolygon(latLngs);
			this.valuePolygons.addLayer(newPolygon);
			this.syncValue();
		}

		if (this.tool === 'subtract') {
			if (!this.inputDragCoords) return;
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

	handleMapKeydown(event: LeafletKeyboardEvent) {
		if (event.originalEvent.key === 'Escape' && this.inputStart) {
			this.inputStart = null;
			this.inputDragCoords = null;
			dispatchEvent(new CustomEvent('pointerup', { bubbles: true }));
		}

		if (['Backspace', 'Delete'].includes(event.originalEvent.key)) {
			const polygons = this.valuePolygons.getLayers() as EditablePolygon[];
			polygons.forEach(polygon => {
				const polygonCorners = polygon.corners.getLayers() as CornerMarker[];
				const toRemove = polygonCorners.filter(c => this.selectedCorners.includes(c));
				polygon.removeCorners(toRemove);
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
			const geojson = prompt('Paste in a GeoJSON feature', this.getAttribute('value') ?? '')?.trim();
			if (geojson) {
				const newValue = JSON.parse(geojson);
				this.value = newValue;
				this.syncValue();
			}
		} catch (error) {
			console.error(error);
			alert('Invalid GeoJSON');
		}
	}

	importShapefile() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.shp';
		this.append(input);
		input.onchange = async () => {
			const { shp } = this;
			try {
				const shpFile = Array.from(input.files!).find(f => f.name.endsWith('.shp'));
				input.remove();
				if (!shpFile) return;
				const shpBuffer = await shpFile.arrayBuffer();
				let result = await shp.parseShp(shpBuffer);
				if (Array.isArray(result)) result = result[0];
				this.value = result;
				this.syncValue();
			} catch (error) {
				console.error(error);
				alert('Couldn’t read shapefile');
			}
		};
		input.click();
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
