import { Handler, Layer, Map as LeafletMap } from 'leaflet';

function relativeDragHandler = Handler.extend({
	addHooks() {

	},
	removeHooks() {},
});

export default function(layer: Layer, map: LeafletMap) {
	layer.on('mousedown', event => {
		addEventListener('mousemove', event => {
			console.log(event);
			addEventListener
		});
	});

}
