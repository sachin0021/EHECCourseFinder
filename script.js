const courseGrid = document.getElementById("courses");
const universitySearch = document.getElementById("university-search");
const courseAreaSearch = document.getElementById("course-area-search");
const courseSearch = document.getElementById("course-search");
const degreeFilter = document.getElementById("degree-filter");
const sortFilter = document.getElementById("sort-filter");
const resetButton = document.getElementById("reset-filters");
const resultsCount = document.getElementById("results-count");
const emptyState = document.getElementById("empty-state");
const universityOptions = document.getElementById("university-options");
const courseAreaOptions = document.getElementById("course-area-options");

let courses = [];

// Parse a CSV line while handling quoted values.
const parseCSVLine = (line) => {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
};

// Convert CSV text into structured course objects.
const parseCSV = (csvText) => {
  const rows = csvText.trim().split(/\r?\n/);
  const [headerLine, ...dataLines] = rows;
  const headers = parseCSVLine(headerLine);

  return dataLines.map((line) => {
    const values = parseCSVLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    const durationValue = row["Duration"];
    const durationHasMonths = /months?/i.test(durationValue);

    return {
      courseName: row["Course Name"],
      universityName: row["University"],
      universityType: row["University Type"],
      degreeType: row["Degree Type"],
      duration: durationHasMonths ? durationValue : `${durationValue} years`,
      language: row["Language"],
      courseCode: row["Course Code"],
      courseArea: row["Course Area"],
      website: row["Website"],
    };
  });
};

// Fetch course data once on load.
const loadCourses = async () => {
  try {
    const response = await fetch("data/courses.csv");
    const csvText = await response.text();
    courses = parseCSV(csvText);
    populateUniversityOptions(courses);
    populateCourseAreaOptions(courses);
    renderCourses();
  } catch (error) {
    resultsCount.textContent = "Unable to load courses.";
  }
};

// Fill the datalist dropdown with unique university names.
const populateUniversityOptions = (data) => {
  const universities = Array.from(
    new Set(data.map((course) => course.universityName))
  ).sort();

  universityOptions.innerHTML = universities
    .map((name) => `<option value="${name}"></option>`)
    .join("");
};

const populateCourseAreaOptions = (data) => {
  const courseAreas = Array.from(
    new Set(data.map((course) => course.courseArea))
  )
    .filter(Boolean)
    .sort();

  courseAreaOptions.innerHTML = courseAreas
    .map((area) => `<option value="${area}"></option>`)
    .join("");
};

const normalizeText = (value) =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

// Compute the Levenshtein distance between two strings.
const getEditDistance = (value, target) => {
  const source = normalizeText(value);
  const comparison = normalizeText(target);

  if (!source || !comparison) {
    return Math.max(source.length, comparison.length);
  }

  const matrix = Array.from({ length: source.length + 1 }, () =>
    new Array(comparison.length + 1).fill(0)
  );

  for (let i = 0; i <= source.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= comparison.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= source.length; i += 1) {
    for (let j = 1; j <= comparison.length; j += 1) {
      const cost = source[i - 1] === comparison[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[source.length][comparison.length];
};

// Allow minor typos in course searches.
const matchesWithTolerance = (query, text) => {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalizeText(query);
  const normalizedText = normalizeText(text);

  if (normalizedText.includes(normalizedQuery)) {
    return true;
  }

  const words = normalizedText.split(/\s+/);
  const maxDistance = Math.max(2, Math.floor(normalizedQuery.length * 0.2));

  return (
    getEditDistance(normalizedQuery, normalizedText) <= maxDistance ||
    words.some((word) => getEditDistance(normalizedQuery, word) <= maxDistance)
  );
};

// Apply search, filters, and sorting together.
const getFilteredCourses = () => {
  const universityQuery = universitySearch.value.trim().toLowerCase();
  const courseAreaQuery = courseAreaSearch.value.trim().toLowerCase();
  const courseQuery = courseSearch.value.trim().toLowerCase();
  const degreeQuery = degreeFilter.value;

  let filtered = courses.filter((course) => {
    const matchesUniversity = universityQuery
      ? course.universityName.toLowerCase().includes(universityQuery)
      : true;
    const matchesCourseArea = courseAreaQuery
      ? course.courseArea.toLowerCase().includes(courseAreaQuery)
      : true;
    const matchesCourse = matchesWithTolerance(courseQuery, course.courseName);
    const matchesDegree = degreeQuery
      ? course.degreeType === degreeQuery
      : true;

    return (
      matchesUniversity && matchesCourseArea && matchesCourse && matchesDegree
    );
  });

  const sortValue = sortFilter.value;
  if (sortValue === "university") {
    filtered = filtered.sort((a, b) =>
      a.universityName.localeCompare(b.universityName)
    );
  }

  if (sortValue === "degree") {
    filtered = filtered.sort((a, b) =>
      a.degreeType.localeCompare(b.degreeType)
    );
  }

  return filtered;
};

// Render the course cards.
const renderCourses = () => {
  const isInitialState =
    !universitySearch.value.trim() &&
    !courseAreaSearch.value.trim() &&
    !courseSearch.value.trim() &&
    !degreeFilter.value &&
    !sortFilter.value;
  const filteredCourses = getFilteredCourses();
  const visibleCourses = isInitialState
    ? filteredCourses.slice(0, 10)
    : filteredCourses;

  courseGrid.innerHTML = visibleCourses
    .map((course) => {
      return `
        <article class="course-card">
          <header>
            <span class="tag">${course.degreeType}</span>
            <h3>${course.courseName}</h3>
            <p><strong>${course.universityName}</strong></p>
          </header>
          <div class="course-meta">
            <span><strong>University Type</strong><span>${course.universityType}</span></span>
            <span><strong>Course Code</strong><span>${course.courseCode}</span></span>
            <span><strong>Course Area</strong><span>${course.courseArea}</span></span>
            <span><strong>Language</strong><span>${course.language}</span></span>
            <span><strong>Duration</strong><span>${course.duration}</span></span>
            <span><strong>Country</strong><span>Italy</span></span>
          </div>
          <div class="course-actions">
            <!--
            <a class="primary-button" href="${course.website}" target="_blank" rel="noopener">
              Visit
            </a>
            -->
          </div>
        </article>
      `;
    })
    .join("");

  resultsCount.textContent = `${filteredCourses.length} course(s) found`;
  emptyState.hidden = filteredCourses.length !== 0;
};

const resetFilters = () => {
  universitySearch.value = "";
  courseAreaSearch.value = "";
  courseSearch.value = "";
  degreeFilter.value = "";
  sortFilter.value = "";
  renderCourses();
};

[
  universitySearch,
  courseAreaSearch,
  courseSearch,
  degreeFilter,
  sortFilter,
].forEach((input) => {
  input.addEventListener("input", renderCourses);
  input.addEventListener("change", renderCourses);
});

[universitySearch, courseAreaSearch].forEach((input) => {
  input.addEventListener("pointerdown", () => {
    if (!input.value) {
      return;
    }

    const originalValue = input.value;
    input.value = "";
    if (typeof input.showPicker === "function") {
      input.showPicker();
    }
    requestAnimationFrame(() => {
      if (document.activeElement === input && !input.value) {
        input.value = originalValue;
      }
    });
  });
});

resetButton.addEventListener("click", resetFilters);

loadCourses();
