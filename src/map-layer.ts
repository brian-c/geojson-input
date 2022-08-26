import { Map as LeafletMap } from 'leaflet';

export default class MapLayer extends HTMLElement {
	#cachedMap?: typeof this.map;

	get map(): LeafletMap {
		if (!this.#cachedMap) {
			const parent = (this.parentElement ?? (this.getRootNode() as ShadowRoot).host) as HTMLElement & { map: LeafletMap };
			this.#cachedMap = parent.map;
		}
		return this.#cachedMap;
	}
}
