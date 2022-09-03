import { CircleMarker, FeatureGroup, LatLng, LatLngExpression, Map, Polygon } from 'leaflet';

const COLOR = 'royalblue';

export class CornerMarker extends CircleMarker {
	polygon: EditablePolygon | undefined;
	coord: LatLng | undefined;

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

		this.selected = this.selected;
		this.setRadius(5);
		this.setStyle({ color: COLOR, fillOpacity: 1 });
	}

	setLatLng(latLng: LatLngExpression): this {
		super.setLatLng(latLng);
		if (this.polygon && this.coord) {
			const newLatLng = this.getLatLng();
			this.coord.lat = newLatLng.lat;
			this.coord.lng = newLatLng.lng;
			this.polygon.redraw();
		}
		return this;
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
		this.corners.addTo(map);
		this.addEventParent(map);
		this.corners.addEventParent(map);
		return this;
	}

	onRemove(map: Map) {
		super.onRemove(map);
		this.removeEventParent(map);
		this.corners.removeEventParent(map);
		this.corners.removeFrom(map);
		return this;
	}

	setLatLngs(...args: Parameters<Polygon['setLatLngs']>): this {
		super.setLatLngs(...args);
		this.redrawCorners();
		return this;
	}

	redrawCorners(latLngs = this.getLatLngs()) {
		this.corners.clearLayers();
		const points = latLngs.flat(Infinity);
		points.forEach(point => {
			point = point as LatLng;
			const corner = new CornerMarker(point);
			corner.polygon = this;
			corner.coord = point;
			this.corners.addLayer(corner);
			corner.bringToFront();
		});
	}

	filterLatLngs(fn: (latLng: LatLng) => any, latLngs = this.getLatLngs()): ReturnType<Polygon['getLatLngs']> {
		return latLngs.map(item => {
			if (Array.isArray(item) && Array.isArray(item[0])) {
				return this.filterLatLngs(fn, item);
			} else {
				return (item as LatLng[]).filter(ll => fn(ll));
			}
		}) as ReturnType<Polygon['getLatLngs']>;
	}

	removeCorner(corner: CornerMarker) {
		const cornerLatLng = corner.getLatLng();
		const newLatLngs = this.filterLatLngs((latLng) => {
			return latLng !== cornerLatLng;
		});
		this.setLatLngs(newLatLngs);
	}
}
