import { Layer, LeafletMouseEvent, LeafletMouseEventHandlerFn, Map } from 'leaflet';

export type DragHelper = (type: string, event: LeafletMouseEvent) => any;

export default function whileDragging(
	target: Layer | Map,
	handleDragEvent: DragHelper,
	map: Map,
) {
	let lastMoveEvent: LeafletMouseEvent | null = null;

	const handleMove: LeafletMouseEventHandlerFn = event => {
		event.originalEvent.preventDefault();
		lastMoveEvent = event;
		handleDragEvent('move', event);
	};

	const handleRelease = () => {
		map.off('mousemove', handleMove);
		removeEventListener('mouseup', handleRelease);
		handleDragEvent('release', lastMoveEvent!);
		lastMoveEvent = null;
	};

	target.on('mousedown', event => {
		event.originalEvent.preventDefault();
		handleDragEvent('start', event);
		map.on('mousemove', handleMove);
		addEventListener('mouseup', handleRelease);
	});
}
