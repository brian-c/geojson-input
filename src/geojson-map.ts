export default class GeoJSONMap extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot!.append('Here');
	}
}
