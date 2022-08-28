import { coordEach } from '@turf/meta';
import { CircleMarker, FeatureGroup, LeafletMouseEvent, LeafletMouseEventHandlerFn } from 'leaflet';
import GeoJSONLayer from './geojson-layer';

const cornerIndexStrings = new WeakMap<CircleMarker, string>();
const cornerGeometryIndices = new WeakMap<CircleMarker, number>();

export default class PolygonLayer extends GeoJSONLayer {
	get feature(): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
		return super.feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
	}

	set feature(value) {
		super.feature = value;
		this.syncCorners();
	}

	get selected() {
		return super.selected;
	}

	set selected(value) {
		super.selected = value;
		if (value) {
			this.map.addLayer(this.corners);
		} else {
			this.corners.remove();
		}
	}

	corners: FeatureGroup;
	selectedCorners: CircleMarker[] = [];
	lastDragEvent: LeafletMouseEvent | null = null;

	constructor() {
		super();
		this.corners = new FeatureGroup();
	}

	connectedCallback() {
		super.connectedCallback();
		console.log('Polygon connected');
		this.corners.on('mousedown', this.handleCornerDragStart);
		this.feature = this.feature;
		this.selected = this.selected;
	}

	disconnectedCallback() {
		this.corners.off();
	}

	syncCorners() {
		let cornerCount = 0;

		let priorGi: number;
		let priorCorner: CircleMarker;

		const cornerLayers = this.corners.getLayers();

		coordEach(this.feature, (coord, i, fi, mfi, gi) => {
			if (gi !== priorGi && priorCorner) {
				priorCorner.remove();
			}

			let corner = cornerLayers[i] as CircleMarker;

			if (!corner) {
				corner = new CircleMarker([coord[1], coord[0]], { radius: 5 });
				this.corners.addLayer(corner);
			} else {
				corner.setLatLng([coord[1], coord[0]]);
			}

			corner.bringToFront();
			corner.setStyle({ color: this.color });
			cornerIndexStrings.set(corner, [i, fi, mfi, gi].join('/'));
			cornerGeometryIndices.set(corner, gi);

			cornerCount += 1;

			priorCorner = corner;
			priorGi = gi;
		});

		if (priorCorner!) {
			priorCorner.remove();
		}

		const extraLayers = cornerLayers.slice(cornerCount);
		extraLayers.forEach(extraLayer => {
			this.corners.removeLayer(extraLayer);
		});
	}

	handleCornerDragStart: LeafletMouseEventHandlerFn = event => {
		event.originalEvent.preventDefault();
		this.map.dragging.disable();
		this.selectedCorners = [event.sourceTarget];
		this.map.on('mousemove', this.handleCornerDragMove);
		addEventListener('mouseup', this.handleCornerDragRelease);
	}

	handleCornerDragMove: LeafletMouseEventHandlerFn = event => {
		if (this.lastDragEvent) {
			const latDelta = event.latlng.lat - this.lastDragEvent!.latlng.lat;
			const lngDelta = event.latlng.lng - this.lastDragEvent!.latlng.lng;
			for (const corner of this.selectedCorners) {
				const cornerLatlng = corner.getLatLng();
				corner.setLatLng([cornerLatlng.lat + latDelta, cornerLatlng.lng + lngDelta]);
				this.updateFeatureCorner(corner);
			}
		}
		this.lastDragEvent = event;
	}

	handleCornerDragRelease: EventListener = () => {
		this.lastDragEvent = null;
		this.map.off('mousemove', this.handleCornerDragMove);
		removeEventListener('mouseup', this.handleCornerDragRelease);
		this.map.dragging.enable();
	}

	updateFeatureCorner(corner: CircleMarker) {
		const targetCoords = [cornerIndexStrings.get(corner)!];

		const geometryIndex = cornerGeometryIndices.get(corner);
		const geometryCoords: string[] = [];
		coordEach(this.feature, (_coord, i, fi, mfi, gi) => {
			const indexString = [i, fi, mfi, gi].join('/');
			if (gi === geometryIndex) geometryCoords.push(indexString);
		});

		if (geometryCoords.indexOf(targetCoords[0]) === 0) {
			targetCoords.push(geometryCoords[geometryCoords.length - 1]);
		} else if (geometryCoords.indexOf(targetCoords[0]) === geometryCoords.length - 1) {
			targetCoords.push(geometryCoords[0]);
		}

		const feature = this.feature;
		const cornerLatlng = corner.getLatLng();
		coordEach(feature, (coord, ...indices) => {
			const indexString = indices.join('/');
			if (targetCoords.includes(indexString)) {
				coord[0] = cornerLatlng.lng;
				coord[1] = cornerLatlng.lat;
			}
		});

		this.feature = feature;
	};
}
