import { LatLng, Map as LeafletMap, TileLayer } from 'leaflet';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import mapCss from './geojson-map.css?inline';

export default class GeoJSONMap extends HTMLElement {
	public get tiles(): string {
		return this.getAttribute('tiles') ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
	}

	public get center(): [lng: number, lat: number] {
		const center = this.getAttribute('center')?.split(',').map(parseFloat);
		return [center?.[0] ?? -87.7, center?.[1] ?? 41.9];
	}

	public set center(value) {
		this.setAttribute('center', value.join(','));
		const mapCenter = this.map.getCenter();
		if (
			Math.abs(1 - mapCenter.lng / value[0]) > 0.0001 ||
			Math.abs(1 - mapCenter.lat / value[1]) > 0.0001
		) {
			this.map.setView([value[1], value[0]]);
		}
	}

	get zoom(): number {
		return parseFloat(this.getAttribute('zoom') ?? '10');
	}

	set zoom(value) {
		this.setAttribute('zoom', value.toString());
		if (1 - this.map.getZoom() / value > 0.0001) {
			this.map.setZoom(value);
		}
	}

	map: LeafletMap;

	constructor() {
		super();

		this.attachShadow({ mode: 'open' });

		this.shadowRoot!.innerHTML = `
			<style>${leafletCss}</style>
			<style>${mapCss}</style>
			<div id="map-container"></div>
		`;

		const mapContainer = this.shadowRoot!.getElementById('map-container')!;
		this.map = new LeafletMap(mapContainer);
		this.map.addLayer(new TileLayer(this.tiles));
		this.map.setView(new LatLng(this.center[1], this.center[0]), this.zoom);

		this.map.on('zoomend', () => {
			this.zoom = this.map.getZoom();
		});

		this.map.on('moveend', () => {
			const center = this.map.getCenter();
			this.center = [center.lng, center.lat];
		});
	}

	connectedCallback() {
		this.map.invalidateSize();
	}

	disconnectedCallback() {
		this.map.remove();
	}
}
