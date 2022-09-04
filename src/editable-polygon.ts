import { CircleMarker, FeatureGroup, LatLng, Map, Polygon } from 'leaflet';

const COLOR = 'royalblue';

export class CornerMarker extends CircleMarker {
	#selected = false;

	get selected(): boolean {
		return this.#selected;
	}

	set selected(selected) {
		this.#selected = selected;
		this.setStyle({ fillColor: selected ? COLOR : 'white' });
	}

	constructor(...args: ConstructorParameters<typeof CircleMarker>) {
		super(...args);
		this.setRadius(5);
		this.setStyle({ color: COLOR, fillOpacity: 1 });
		this.selected = this.selected;
	}

	translateLatLng(latDelta: number, lngDelta: number) {
		const latLng = this.getLatLng();
		latLng.lat += latDelta;
		latLng.lng += lngDelta;
		this.setLatLng(latLng);
		this.fire('update', null, true);
	}
}

export class EditablePolygon extends Polygon {
	corners = new FeatureGroup<CornerMarker>([], {});
	pointCorners = new WeakMap<LatLng, CornerMarker>();

	constructor(...args: ConstructorParameters<typeof Polygon>) {
		super(...args);
		this.setStyle({ color: COLOR });
		this.redrawCorners();
	}

	onAdd(map: Map) {
		super.onAdd(map);
		this.addEventParent(map);
		this.corners.addTo(map);
		this.corners.addEventParent(map);
		this.corners.on('update', this.handleCornerUpdates, this);
		return this;
	}

	onRemove(map: Map) {
		super.onRemove(map);
		this.removeEventParent(map);
		this.corners.removeFrom(map);
		this.corners.removeEventParent(map);
		this.corners.off('update', this.handleCornerUpdates, this);
		return this;
	}

	setLatLngs(...args: Parameters<Polygon['setLatLngs']>): this {
		super.setLatLngs(...args);
		this.redrawCorners();
		return this;
	}

	#cornerDidUpdate = false;
	handleCornerUpdates() {
		if (this.#cornerDidUpdate) return;
		this.#cornerDidUpdate = true;
		requestAnimationFrame(() => {
			this.redraw();
			this.#cornerDidUpdate = false;
		});
	}

	redrawCorners(latLngs = this.getLatLngs()) {
		this.corners.clearLayers();
		const cornerCoords = latLngs.flat(Infinity) as LatLng[];
		if (cornerCoords.length > 100) return;
		cornerCoords.forEach(latLng => {
			const corner = new CornerMarker(latLng);
			this.corners.addLayer(corner);
			corner.bringToFront();
		});
	}

	removeCorners(corners: CornerMarker[]) {
		const cornerLatLngs = corners.map(c => c.getLatLng());
		const newLatLngs = this.filterLatLngs(this.getLatLngs(), latLng => {
			return !cornerLatLngs.includes(latLng);
		});
		this.setLatLngs(newLatLngs);
	}

	filterLatLngs(latLngs: ReturnType<Polygon['getLatLngs']>, fn: (latLng: LatLng) => any): ReturnType<Polygon['getLatLngs']> {
		return latLngs.map(item => {
			if (Array.isArray(item) && Array.isArray(item[0])) {
				return this.filterLatLngs(item, fn);
			} else {
				return (item as LatLng[]).filter(ll => fn(ll));
			}
		}) as ReturnType<Polygon['getLatLngs']>;
	}
}
