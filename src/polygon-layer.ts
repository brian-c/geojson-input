import { coordEach } from '@turf/meta';
import { GeoJSON } from 'leaflet';
import CornerLayer from './corner-layer';
import MapLayer from './map-layer';

export default class PolygonLayer extends MapLayer {
	get feature(): GeoJSON.Polygon {
		return JSON.parse(this.getAttribute('feature') ?? '{}');
	}

	set feature(feature) {
		this.setAttribute('feature', JSON.stringify(feature));

		this.#polygon.clearLayers();
		this.#polygon.addData(this.feature);
		this.#polygon.bringToBack();

		let cornerCount = 0;

		let lastGi = -1;
		let lastCorner: CornerLayer;
		coordEach(this.feature, (coord, i, fi, mfi, gi) => {
			if (gi !== lastGi) lastCorner?.hide();
			let corner = this.shadowRoot!.children[i] as CornerLayer | undefined;

			if (!corner) {
				corner = new CornerLayer();
				this.shadowRoot!.append(corner);
			}

			const coordId = [i, fi, mfi, gi].join('/');
			corner.coordinateId = coordId;
			corner.lng = coord[0];
			corner.lat = coord[1];
			corner.dataset.gi = gi.toString();

			cornerCount += 1;

			lastCorner = corner;
			lastGi = gi;
		});

		lastCorner!.hide();

		while (this.shadowRoot!.children.length > cornerCount) {
			this.shadowRoot!.children[this.shadowRoot!.children.length - 1].remove();
		}
	}

	#polygon: GeoJSON;
	get _polygon() { return this.#polygon; }

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.#polygon = new GeoJSON(undefined, { style: { color: 'gray' } });
	}

	connectedCallback() {
		console.log('Polygon connected');
		this.shadowRoot!.addEventListener('corner-move', this.handleCornerMove);
		this.map.addLayer(this.#polygon);
		this.feature = this.feature;
	}

	disconnectedCallback() {
		this.shadowRoot!.removeEventListener('corner-move', this.handleCornerMove);
		this.map.removeLayer(this.#polygon);
	}

	handleCornerMove: EventListener = event => {
		this.map.dragging.disable();

		const corner = event.target as CornerLayer;
		const feature = this.feature;

		const targetCoords = [corner.coordinateId];

		const geometryId = parseFloat(corner.dataset.gi!);
		const geometryCoords: string[] = [];
		coordEach(feature, (_coord, i, fi, mfi, gi) => {
			const id = [i, fi, mfi, gi].join('/');
			if (gi === geometryId) geometryCoords.push(id);
		});

		if (geometryCoords.indexOf(targetCoords[0]) === 0) {
			targetCoords.push(geometryCoords[geometryCoords.length - 1]);
		} else if (geometryCoords.indexOf(targetCoords[0]) === geometryCoords.length - 1) {
			targetCoords.push(geometryCoords[0]);
		}

		coordEach(feature, (coord, i, fi, mfi, gi) => {
			const id = [i, fi, mfi, gi].join('/');
			if (targetCoords.includes(id)) {
				coord[0] = (event as CustomEvent).detail.lng;
				coord[1] = (event as CustomEvent).detail.lat;
			}
		});
		this.feature = feature;

		this.map.dragging.enable();
	};
}
