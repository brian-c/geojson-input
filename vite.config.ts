import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		lib: {
			entry: 'src/geojson-map.ts',
			formats: ['es']
		},
		sourcemap: true,
	},
});
