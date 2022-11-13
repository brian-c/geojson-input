import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		lib: {
			entry: 'src/geojson-input.ts',
			formats: ['es']
		},
		sourcemap: true,
	},
});
