import { AllGeoJSON, feature, rhumbBearing, rhumbDistance, transformTranslate } from '@turf/turf';
import { GeoJSON, GeoJSONOptions, LeafletMouseEventHandlerFn, Map as LeafletMap } from 'leaflet';
import type GeoJSONMap from './geojson-map';

const DEFAULT_FEATURE_JSON = JSON.stringify(feature([]))

export default class GeoJSONLayer extends HTMLElement {
	static defaultColor = 'magenta';

	get map(): LeafletMap {
		const parent = (this.parentElement ?? (this.getRootNode() as ShadowRoot).host) as GeoJSONMap | undefined;
		if (!parent) {
			throw new Error('Map layer must be within a map');
		}
		return parent.map;
	}

	layer: GeoJSON;

	get feature(): GeoJSON.Feature {
		return JSON.parse(this.getAttribute('feature') ?? DEFAULT_FEATURE_JSON);
	}

	set feature(value) {
		this.layer.clearLayers();
		if (value) {
			this.layer.addData(value);
			this.setAttribute('feature', JSON.stringify(value));
		} else {
			this.removeAttribute('feature');
		}
	}

	get selected(): boolean {
		return this.hasAttribute('selected');
	}

	set selected(value) {
		if (value) {
			this.setAttribute('selected', 'true');
			this.dispatchEvent(new CustomEvent('select'));
		} else {
			this.removeAttribute('selected');
		}
	}

	get hidden(): boolean {
		return Boolean(this.getAttribute('hidden'));
	}

	set hidden(value) {
		if (value) {
			this.layer.remove();
			this.removeAttribute('hidden');
		} else {
			this.map.addLayer(this.layer);
			this.setAttribute('hidden', 'true');
		}
	}

	get color(): string {
		return this.getAttribute('color') ?? (this.constructor as any).defaultColor;
	}

	set color(value) {
		if (value) {
			this.setAttribute('color', value);
		} else {
			this.removeAttribute('color');
		}
		this.layer.setStyle({ color: this.color });
	}

	getOptions(): GeoJSONOptions {
		return {};
	}

	constructor() {
		super();
		const options = this.getOptions();
		this.layer = new GeoJSON(this.feature ?? undefined, {
			...options,
			style: {
				color: this.color,
				...options.style
			}
		});
	}

	connectedCallback() {
		this.hidden = this.hidden;
		this.layer.on('mousedown', this.handleLayerDragStart);
	}

	disconnectedCallback() {
		this.layer.off();
	}

	priorDragCoords: [number, number] | null = null;

	handleLayerDragStart: LeafletMouseEventHandlerFn = event => {
		event.originalEvent.preventDefault();
		this.map.dragging.disable();
		addEventListener('mouseup', this.handleLayerDragRelease);
		this.map.on('mousemove', this.handleLayerDragMove);
		this.selected = true;
	}

	handleLayerDragMove: LeafletMouseEventHandlerFn = event => {
		const eventLngLat: [number, number] = [event.latlng.lng, event.latlng.lat];
		if (this.priorDragCoords) {
			const bearing = rhumbBearing(this.priorDragCoords, eventLngLat);
			const distance = rhumbDistance(this.priorDragCoords, eventLngLat);
			this.translateFeature(bearing, distance);
		}
		this.priorDragCoords = eventLngLat;
	}

	handleLayerDragRelease: EventListener = () => {
		this.priorDragCoords = null;
		this.map.off('mousemove', this.handleLayerDragMove);
		removeEventListener('mouseup', this.handleLayerDragRelease);
		this.map.dragging.enable();
	}

	translateFeature(bearing: number, distance: number) {
		this.feature = transformTranslate(this.feature as AllGeoJSON, distance, bearing) as GeoJSON.Feature;
		this.dispatchEvent(new CustomEvent('translate', { detail: { bearing, distance } }));
	}
}
