import L from 'leaflet';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import mapCss from './geojson-map.css?inline';

export default class GeoJSONMap extends HTMLElement {
	static get observedAttributes() {
		return ['center', 'zoom'];
	}

	#map = null as L.Map | null;

	get tiles(): string {
		return this.getAttribute('tiles') ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
	}

	get center(): [lng: number, lat: number] {
		const center = this.getAttribute('center')?.split(',').map(parseFloat);
		return [center?.[0] ?? -87.7, center?.[1] ?? 41.9];
	}

	set center(value) {
		this.setAttribute('center', value.join(','));
		this.#map?.setView([value[1], value[0]]);
	}

	get zoom(): number {
		return parseFloat(this.getAttribute('zoom') ?? '10');
	}

	set zoom(value) {
		this.setAttribute('zoom', value.toString());
		this.#map?.setZoom(value);
	}

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
	}

	connectedCallback() {
		const style = this.ownerDocument.createElement('style');
		style.textContent = [mapCss, leafletCss].join('\n');
		this.shadowRoot!.append(style);

		const container = this.ownerDocument.createElement('div');
		container.id = 'map-container';
		this.shadowRoot!.append(container);

		this.#map = new L.Map(container);
		this.#map.addLayer(new L.TileLayer(this.tiles));
		this.#map.setView(new L.LatLng(this.center[1], this.center[0]), this.zoom);
	}

	disconnectedCallback() {
		this.#map?.remove();
	}
}
