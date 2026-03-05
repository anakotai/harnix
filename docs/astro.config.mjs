// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Harnix Docs',
			description: 'Documentation for the Harnix harness readiness scanner.',
			logo: {
				src: './src/assets/anakot-logo.svg',
				alt: 'Anakot logo'
			},
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/anakotai/harnix' }],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Get Started',
					items: [
						{ label: 'Introduction', slug: 'index' },
						{ slug: 'getting-started' },
						{ slug: 'installation' },
						{ slug: 'what-is-harness-engineering' }
					]
				},
				{
					label: 'Reference',
					items: [
						{ slug: 'cli-reference' },
						{ slug: 'configuration' },
						{ slug: 'scoring-methodology' },
						{ slug: 'check-catalog' }
					]
				},
				{
					label: 'Community',
					items: [{ slug: 'contributing' }, { slug: 'faq' }]
				}
			]
		})
	]
});
