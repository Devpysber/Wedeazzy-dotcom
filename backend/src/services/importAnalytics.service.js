/**
 * Import Analytics & Data Intelligence Service for WedEazzy
 * Computes Data Quality Score, Category & City Distribution,
 * City x Category Matrix, Duplicate Intelligence, and Side-by-Side Comparisons.
 */

/**
 * Compute Data Quality Score (0-100) and sub-metrics.
 */
function calculateDataQualityScore(candidates, summary) {
  const total = candidates.length;
  if (!total) {
    return {
      overallScore: 0,
      grade: 'Poor',
      metrics: {
        phoneCoverage: 0,
        businessNameCoverage: 0,
        cityCoverage: 0,
        categoryCoverage: 0,
        duplicateCleanliness: 100,
        emailCoverage: 0,
        websiteCoverage: 0,
      },
    };
  }

  let withPhone = 0;
  let withName = 0;
  let withCity = 0;
  let withCategory = 0;
  let withEmail = 0;
  let withWebsite = 0;

  candidates.forEach(c => {
    if (c.phone) withPhone++;
    if (c.name) withName++;
    if (c.city && c.city !== 'Unknown') withCity++;
    if (c.category && c.category !== 'Other') withCategory++;
    if (c.email) withEmail++;
    if (c.website) withWebsite++;
  });

  const phoneCoverage = Math.round((withPhone / total) * 100);
  const businessNameCoverage = Math.round((withName / total) * 100);
  const cityCoverage = Math.round((withCity / total) * 100);
  const categoryCoverage = Math.round((withCategory / total) * 100);
  const emailCoverage = Math.round((withEmail / total) * 100);
  const websiteCoverage = Math.round((withWebsite / total) * 100);

  const totalDupes = (summary.duplicateInFile || 0) + (summary.duplicateInDb || 0);
  const duplicateCleanliness = Math.max(0, Math.round(((total - totalDupes) / total) * 100));

  // Weighted Score Formula:
  // Business Name: 25%, Phone: 25%, City: 15%, Category: 15%, Cleanliness: 10%, Email/Website: 10%
  const overallScore = Math.round(
    (businessNameCoverage * 0.25) +
    (phoneCoverage * 0.25) +
    (cityCoverage * 0.15) +
    (categoryCoverage * 0.15) +
    (duplicateCleanliness * 0.10) +
    (((emailCoverage + websiteCoverage) / 2) * 0.10)
  );

  let grade = 'Poor';
  if (overallScore >= 85) grade = 'Excellent';
  else if (overallScore >= 70) grade = 'Good';
  else if (overallScore >= 50) grade = 'Average';

  // Dynamic Dataset Health Explanation
  const explanationParts = [];
  if (overallScore >= 80) {
    explanationParts.push('Your dataset is in great shape for import.');
  } else if (overallScore >= 50) {
    explanationParts.push('Your dataset is acceptable, but could be improved.');
  } else {
    explanationParts.push('Your dataset contains significant missing or inconsistent fields.');
  }

  if (phoneCoverage === 100) {
    explanationParts.push('All records contain valid contact phone numbers.');
  } else if (phoneCoverage > 0) {
    explanationParts.push(`${100 - phoneCoverage}% of listings are missing phone numbers.`);
  } else {
    explanationParts.push('No phone numbers were detected in this dataset.');
  }

  if (totalDupes > 0) {
    explanationParts.push(`Review ${totalDupes} duplicate record${totalDupes === 1 ? '' : 's'} before importing.`);
  }

  return {
    overallScore,
    grade,
    explanation: explanationParts.join(' '),
    metrics: {
      phoneCoverage,
      businessNameCoverage,
      cityCoverage,
      categoryCoverage,
      duplicateCleanliness,
      emailCoverage,
      websiteCoverage,
    },
  };
}

/**
 * Generate Category & City Analytics, Matrix, and Dynamic Insights
 */
function generateDistributionAnalytics(candidates, dataQualitySummary = {}) {
  const categoryCounts = {};
  const cityCounts = {};
  const matrixMap = {}; // city -> category -> count

  candidates.forEach(c => {
    const cat = c.category || 'Other';
    const city = c.city || 'Unknown';

    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    cityCounts[city] = (cityCounts[city] || 0) + 1;

    if (!matrixMap[city]) matrixMap[city] = {};
    matrixMap[city][cat] = (matrixMap[city][cat] || 0) + 1;
  });

  // Top Categories sorted
  const categoriesList = Object.entries(categoryCounts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / candidates.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Top Cities sorted
  const citiesList = Object.entries(cityCounts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / candidates.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Top 8 Cities & Top 6 Categories Matrix
  const topCities = citiesList.slice(0, 8).map(c => c.name);
  const topCategories = categoriesList.slice(0, 6).map(c => c.name);

  const matrix = topCities.map(city => {
    const row = { city };
    topCategories.forEach(cat => {
      row[cat] = matrixMap[city] && matrixMap[city][cat] ? matrixMap[city][cat] : 0;
    });
    return row;
  });

  // Dynamic Insights Generation
  const insights = [];

  const topCity = citiesList[0];
  let cityInsight = '';
  if (topCity) {
    if (topCity.percentage >= 50) {
      cityInsight = `${topCity.name} represents the majority of this dataset with ${topCity.percentage}% of listings (${topCity.count} total).`;
    } else {
      cityInsight = `${topCity.name} is the top city, accounting for ${topCity.percentage}% of listings across ${citiesList.length} cities.`;
    }
    insights.push({ icon: 'fa-location-dot', text: `📍 ${cityInsight}` });
  }

  const topCategory = categoriesList[0];
  let categoryInsight = '';
  if (topCategory) {
    if (categoriesList.length === 1) {
      categoryInsight = `${topCategory.name} is the only category detected in this dataset.`;
    } else {
      categoryInsight = `${topCategory.name} leads with ${topCategory.count} listings (${topCategory.percentage}% of dataset).`;
    }
    insights.push({ icon: 'fa-tags', text: `🏷️ ${categoryInsight}` });
  }

  const metrics = dataQualitySummary.metrics || {};
  if (metrics.phoneCoverage === 100) {
    insights.push({ icon: 'fa-phone', text: '✓ 100% phone coverage — all listings contain contact numbers.' });
  } else if (metrics.phoneCoverage > 0) {
    insights.push({ icon: 'fa-phone-slash', text: `⚠ ${100 - metrics.phoneCoverage}% missing phone numbers.` });
  }

  if (metrics.emailCoverage === 0) {
    insights.push({ icon: 'fa-envelope-open', text: 'ℹ No email data detected in this upload.' });
  } else {
    insights.push({ icon: 'fa-envelope', text: `✓ ${metrics.emailCoverage}% of listings include email contacts.` });
  }

  if (dataQualitySummary.metrics && dataQualitySummary.metrics.duplicateCleanliness === 100) {
    insights.push({ icon: 'fa-shield-check', text: '✓ No duplicate records detected against current database.' });
  }

  return {
    categories: categoriesList,
    cities: citiesList,
    uniqueCategoriesCount: categoriesList.length,
    uniqueCitiesCount: citiesList.length,
    cityInsight,
    categoryInsight,
    insights,
    matrix: {
      headers: ['City', ...topCategories],
      rows: matrix,
    },
  };
}

/**
 * Generate Duplicate Intelligence Statistics and Comparison Drawer Data
 */
function generateDuplicateIntelligence(candidates, existingVendorsMap = {}) {
  const reasons = {
    exactPhone: 0,
    exactEmail: 0,
    nameCityMatch: 0,
    websiteMatch: 0,
    fuzzyMatch: 0,
  };

  const duplicateRows = [];

  candidates.forEach(c => {
    if (c.status === 'duplicate_in_file' || c.status === 'duplicate_in_db') {
      const reasonStr = (c.duplicateReason || '').toLowerCase();
      let matchType = 'Fuzzy Match';

      if (reasonStr.includes('phone')) {
        reasons.exactPhone++;
        matchType = 'Exact Phone Match';
      } else if (reasonStr.includes('email')) {
        reasons.exactEmail++;
        matchType = 'Exact Email Match';
      } else if (reasonStr.includes('name') || reasonStr.includes('city')) {
        reasons.nameCityMatch++;
        matchType = 'Name + City Match';
      } else if (reasonStr.includes('website')) {
        reasons.websiteMatch++;
        matchType = 'Website Match';
      } else {
        reasons.fuzzyMatch++;
      }

      const existingRecord = c.existingVendorId ? existingVendorsMap[c.existingVendorId] : null;

      duplicateRows.push({
        rowNumber: c.rowNumber,
        incoming: {
          name: c.name,
          phone: c.phone,
          city: c.city,
          category: c.category,
          website: c.website,
          address: c.address,
        },
        existing: existingRecord ? {
          id: existingRecord.id,
          name: existingRecord.businessName,
          phone: existingRecord.whatsappNumber,
          city: existingRecord.city,
          category: existingRecord.category,
          website: existingRecord.website,
          address: existingRecord.address,
        } : null,
        matchType,
        reason: c.duplicateReason || 'Potential duplicate listing',
        confidence: c.status === 'duplicate_in_file' ? '100%' : '95%',
        source: c.status === 'duplicate_in_file' ? 'In File' : 'Database',
      });
    }
  });

  return {
    reasons,
    duplicateRows: duplicateRows.slice(0, 100), // First 100 for review table
  };
}

module.exports = {
  calculateDataQualityScore,
  generateDistributionAnalytics,
  generateDuplicateIntelligence,
};
