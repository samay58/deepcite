# DeepCite Confidence Scoring System

## Overview

DeepCite uses a sophisticated confidence scoring system to help users understand the trustworthiness of claims. This document explains how confidence scores are calculated and what they mean.

## Confidence Calculation

The confidence score for a claim is based on multiple factors:

1. **Source Credibility** - Domain reputation ratings from 0 to 1 based on known reliability of source domains:
   - 1.0: Highest credibility (established scientific journals, major reputable news)
   - 0.8: High credibility (well-known reputable sources)
   - 0.6: Medium-high credibility (generally reliable sources)
   - 0.4: Medium credibility (mainstream sources with varying quality)
   - 0.2: Low-medium credibility (less established, potentially biased sources)
   - 0.0: Low credibility (known unreliable/biased sources)

2. **Source Relevance** - How well each source matches the claim, determined by semantic search (0-1 score)

3. **Source Diversity** - Additional confidence when multiple independent sources corroborate a claim

4. **Source Quality** - Bonus for sources that have both high credibility AND high relevance

## Formula Components

The confidence calculation follows these steps:

1. For each source, calculate a weighted score: `sourceScore × domainReputation`
2. Calculate the base confidence as the average of all weighted scores
3. Add a diversity bonus for multiple unique sources: `min(0.2, 0.05 × (uniqueDomains - 1))`
4. Add a quality bonus for high-quality sources: `min(0.15, 0.075 × highQualitySources)`
5. Cap the final score at 1.0 (100%)

Claims with no sources receive a default score of 0.2 (20%).

## Confidence Tiers

Confidence scores are translated into user-friendly tiers:

- **High Confidence** (80-100%): Multiple high-quality sources with strong credibility
- **Medium-High Confidence** (65-79%): Credible sources with good corroboration
- **Medium Confidence** (50-64%): Somewhat reliable sources
- **Low-Medium Confidence** (35-49%): Limited reliable sources
- **Low Confidence** (0-34%): Insufficient reliable sources

## Visual Representation

DeepCite represents confidence visually through:

1. Color-coded confidence meters (green for high, amber for medium, red for low)
2. Textual tier labels alongside percentage scores
3. Explanatory tooltips describing the basis of the confidence assessment
4. Source credibility indicators showing the reputation of each source

This multi-faceted approach helps users quickly assess the trustworthiness of claims while still providing detailed information for those who want to understand the assessment in depth.
