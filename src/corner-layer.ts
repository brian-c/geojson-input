import { CircleMarker } from 'leaflet';
import whileDragging, { DragHelper } from './drag-helper';
import MapLayer from './map-layer';

export default class CornerLayer extends MapLayer {
	get coordinateId() {
		return this.getAttribute('coordinate-id') ?? '';
	}

	set coordinateId(id: string) {
		if (id) {
			this.setAttribute('coordinate-id', id);
		} else {
			this.removeAttribute('coordinate-id');
		}
	}

	get lng(): number {
		return parseFloat(this.getAttribute('lng') ?? '0');
	}

	set lng(value) {
		this.setAttribute('lng', value.toString());
		this.#disc.setLatLng([this.lat, value]);
	}

	get lat(): number {
		return parseFloat(this.getAttribute('lat') ?? '0');
	}

	set lat(value) {
		this.setAttribute('lat', value.toString());
		this.#disc.setLatLng([value, this.lng]);
	}

	#disc: CircleMarker;

	constructor() {
		super();
		this.#disc = new CircleMarker([this.lat, this.lng], { color: 'magenta', fillOpacity: 0.8, radius: 10 });
	}

	connectedCallback() {
		console.log('Corner connected');
		this.map.addLayer(this.#disc);
		whileDragging(this.#disc, this.handleDrag, this.map);
	}

	disconnectedCallback() {
		this.map?.removeLayer(this.#disc);
	}

	handleDrag: DragHelper = (_type, event) => {
		const { lng, lat } = event.latlng;
		this.dispatchEvent(new CustomEvent('corner-move', {
			bubbles: true,
			detail: { lng, lat },
		}));
	};

	hide() {
		this.map?.removeLayer(this.#disc);
	}
}
