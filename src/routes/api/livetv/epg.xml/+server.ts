/**
 * XMLTV EPG Generator for Live TV
 *
 * Generates an XMLTV-format Electronic Program Guide for Plex/Jellyfin/Emby.
 * Matches the M3U playlist tvg-id values for channel mapping.
 *
 * GET /api/livetv/epg.xml
 * GET /api/livetv/epg.xml?hours=48 (default: 24)
 */

import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import { getEpgService } from '$lib/server/livetv/epg/EpgService';
import {
	buildResolvedPlanForLineup,
	mapGuideDataToRequestedChannels
} from '$lib/server/livetv/epg/epg-utils';
import { logger } from '$lib/logging';
import type { ChannelLineupItemWithDetails, EpgProgram } from '$lib/types/livetv';

/**
 * Format a Date as XMLTV timestamp (YYYYMMDDHHmmss +ZZZZ)
 */
function formatXmltvTimestamp(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	const hours = String(date.getUTCHours()).padStart(2, '0');
	const minutes = String(date.getUTCMinutes()).padStart(2, '0');
	const seconds = String(date.getUTCSeconds()).padStart(2, '0');

	return `${year}${month}${day}${hours}${minutes}${seconds} +0000`;
}

/**
 * Escape special XML characters
 */
function escapeXml(text: string): string {
	return (
		text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;')
			// eslint-disable-next-line no-control-regex
			.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
	); // Remove invalid XML characters
}

/**
 * Build channel element for XMLTV
 */
function buildChannelXml(item: ChannelLineupItemWithDetails): string {
	const channelId = item.epgId || item.id;
	const displayName = escapeXml(item.displayName);
	const logo = item.displayLogo ? escapeXml(item.displayLogo) : null;

	const lines: string[] = [`  <channel id="${escapeXml(channelId)}">`];
	lines.push(`    <display-name>${displayName}</display-name>`);

	if (logo) {
		lines.push(`    <icon src="${logo}" />`);
	}

	lines.push('  </channel>');

	return lines.join('\n');
}

/**
 * Build programme element for XMLTV
 */
function buildProgrammeXml(program: EpgProgram, channelXmlId: string): string {
	const start = formatXmltvTimestamp(new Date(program.startTime));
	const stop = formatXmltvTimestamp(new Date(program.endTime));

	const lines: string[] = [
		`  <programme start="${start}" stop="${stop}" channel="${escapeXml(channelXmlId)}">`
	];

	// Title (required)
	lines.push(`    <title lang="en">${escapeXml(program.title)}</title>`);

	// Description
	if (program.description) {
		lines.push(`    <desc lang="en">${escapeXml(program.description)}</desc>`);
	}

	// Category
	if (program.category) {
		lines.push(`    <category lang="en">${escapeXml(program.category)}</category>`);
	}

	// Credits (director and actors)
	if (program.director || program.actor) {
		lines.push('    <credits>');
		if (program.director) {
			lines.push(`      <director>${escapeXml(program.director)}</director>`);
		}
		if (program.actor) {
			// Actors may be comma-separated
			const actors = program.actor
				.split(',')
				.map((a) => a.trim())
				.filter(Boolean);
			for (const actor of actors) {
				lines.push(`      <actor>${escapeXml(actor)}</actor>`);
			}
		}
		lines.push('    </credits>');
	}

	// Episode numbering (use program ID as unique identifier if available)
	// This helps DVRs detect reruns
	if (program.id) {
		lines.push(`    <episode-num system="dd_progid">${escapeXml(program.id)}</episode-num>`);
	}

	lines.push('  </programme>');

	return lines.join('\n');
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Get lookahead hours from query (default 24, max 168 = 1 week)
		const hoursParam = url.searchParams.get('hours');
		const hours = Math.min(168, Math.max(1, parseInt(hoursParam || '24', 10) || 24));

		// Get user's lineup
		const lineup = await channelLineupService.getLineup();

		if (lineup.length === 0) {
			logger.debug('[EPG XML] No channels in lineup');
			return new Response(
				'<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Cinephage"></tv>',
				{
					status: 200,
					headers: {
						'Content-Type': 'application/xml',
						'Content-Disposition': 'inline; filename="cinephage-epg.xml"'
					}
				}
			);
		}

		// Get EPG data for all lineup channels
		const epgService = getEpgService();
		const resolvedPlan = buildResolvedPlanForLineup(lineup);
		const now = new Date();
		const end = new Date(now.getTime() + hours * 60 * 60 * 1000);

		const epgData = mapGuideDataToRequestedChannels(
			resolvedPlan,
			epgService.getGuideData(resolvedPlan.sourceChannelIds, now, end)
		);

		// Build channel ID mapping (channelId -> xmlId)
		const channelXmlIdMap = new Map<string, string>();
		for (const item of lineup) {
			channelXmlIdMap.set(item.channelId, item.epgId || item.id);
		}

		// Build XMLTV document
		const xmlLines: string[] = [
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<tv generator-info-name="Cinephage" generator-info-url="https://github.com/cinephage">'
		];

		// Add channel definitions
		for (const item of lineup) {
			xmlLines.push(buildChannelXml(item));
		}

		// Add programmes
		let programCount = 0;
		for (const [channelId, programs] of epgData) {
			const xmlId = channelXmlIdMap.get(channelId);
			if (!xmlId) continue;

			for (const program of programs) {
				xmlLines.push(buildProgrammeXml(program, xmlId));
				programCount++;
			}
		}

		xmlLines.push('</tv>');

		const xml = xmlLines.join('\n');

		logger.debug(
			{
				channels: lineup.length,
				programs: programCount,
				hours
			},
			'[EPG XML] Generated XMLTV'
		);

		return new Response(xml, {
			status: 200,
			headers: {
				'Content-Type': 'application/xml',
				'Content-Disposition': 'inline; filename="cinephage-epg.xml"',
				'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
			}
		});
	} catch (error) {
		logger.error('[EPG XML] Failed to generate XMLTV', error);
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to generate EPG' }),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};
