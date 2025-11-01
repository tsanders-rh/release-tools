// Stale Issues Dashboard App
class StaleDashboard {
    constructor() {
        this.staleItems = [];
        this.filteredItems = [];
        this.historicalData = [];
        this.currentSort = { field: 'updated', ascending: false };
        this.charts = {
            trends: null,
            breakdown: null
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadData();
        this.loadHistoricalData();
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadData();
        });

        // Filters
        document.getElementById('repo-filter').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('type-filter').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('search-filter').addEventListener('input', () => {
            this.applyFilters();
        });

        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearFilters();
        });

        // Table sorting
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                this.sortBy(field);
            });
        });

        // Trend period selector
        document.getElementById('trend-period').addEventListener('change', () => {
            this.updateCharts();
        });
    }

    async loadData() {
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.style.display = 'flex';

        try {
            this.staleItems = [];

            // Fetch stale items from all configured repositories
            for (const repo of DASHBOARD_CONFIG.repositories) {
                await this.fetchStaleItems(repo.org, repo.repo);
            }

            this.updateStats();
            this.populateRepoFilter();
            this.applyFilters();
            this.updateLastUpdated();
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load data. Please check your GitHub token and try again.');
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    async fetchStaleItems(org, repo) {
        const baseUrl = 'https://api.github.com';
        const headers = {};

        // Add token if configured
        if (DASHBOARD_CONFIG.githubToken) {
            headers['Authorization'] = `token ${DASHBOARD_CONFIG.githubToken}`;
        }

        try {
            // Fetch issues with 'stale' label
            const issuesResponse = await fetch(
                `${baseUrl}/repos/${org}/${repo}/issues?labels=stale&state=open&per_page=100`,
                { headers }
            );

            if (!issuesResponse.ok) {
                console.error(`Failed to fetch issues for ${org}/${repo}:`, issuesResponse.status);
                return;
            }

            const issues = await issuesResponse.json();

            // Process issues (GitHub API returns both issues and PRs in /issues endpoint)
            issues.forEach(item => {
                this.staleItems.push({
                    type: item.pull_request ? 'pr' : 'issue',
                    repo: `${org}/${repo}`,
                    org: org,
                    repoName: repo,
                    title: item.title,
                    number: item.number,
                    author: item.user.login,
                    updated: new Date(item.updated_at),
                    labels: item.labels.map(l => l.name),
                    url: item.html_url,
                    state: item.state
                });
            });
        } catch (error) {
            console.error(`Error fetching data for ${org}/${repo}:`, error);
        }
    }

    updateStats() {
        const totalStale = this.staleItems.length;
        const totalIssues = this.staleItems.filter(item => item.type === 'issue').length;
        const totalPRs = this.staleItems.filter(item => item.type === 'pr').length;
        const totalRepos = new Set(this.staleItems.map(item => item.repo)).size;

        document.getElementById('total-stale').textContent = totalStale;
        document.getElementById('total-issues').textContent = totalIssues;
        document.getElementById('total-prs').textContent = totalPRs;
        document.getElementById('total-repos').textContent = totalRepos;
    }

    populateRepoFilter() {
        const repoFilter = document.getElementById('repo-filter');
        const repos = [...new Set(this.staleItems.map(item => item.repo))].sort();

        // Keep "All Repositories" option
        repoFilter.innerHTML = '<option value="">All Repositories</option>';

        repos.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo;
            option.textContent = repo;
            repoFilter.appendChild(option);
        });
    }

    applyFilters() {
        const repoFilter = document.getElementById('repo-filter').value;
        const typeFilter = document.getElementById('type-filter').value;
        const searchFilter = document.getElementById('search-filter').value.toLowerCase();

        this.filteredItems = this.staleItems.filter(item => {
            if (repoFilter && item.repo !== repoFilter) return false;
            if (typeFilter && item.type !== typeFilter) return false;
            if (searchFilter && !item.title.toLowerCase().includes(searchFilter)) return false;
            return true;
        });

        this.renderTable();
    }

    clearFilters() {
        document.getElementById('repo-filter').value = '';
        document.getElementById('type-filter').value = '';
        document.getElementById('search-filter').value = '';
        this.applyFilters();
    }

    sortBy(field) {
        if (this.currentSort.field === field) {
            this.currentSort.ascending = !this.currentSort.ascending;
        } else {
            this.currentSort.field = field;
            this.currentSort.ascending = false;
        }

        this.filteredItems.sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];

            // Handle different data types
            if (field === 'updated') {
                aVal = aVal.getTime();
                bVal = bVal.getTime();
            } else if (field === 'number') {
                aVal = parseInt(aVal);
                bVal = parseInt(bVal);
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return this.currentSort.ascending ? -1 : 1;
            if (aVal > bVal) return this.currentSort.ascending ? 1 : -1;
            return 0;
        });

        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('table-body');

        if (this.filteredItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">No stale items found</td></tr>';
            return;
        }

        tbody.innerHTML = this.filteredItems.map(item => `
            <tr>
                <td>
                    <span class="badge ${item.type === 'issue' ? 'badge-issue' : 'badge-pr'}">
                        ${item.type === 'issue' ? 'Issue' : 'PR'}
                    </span>
                </td>
                <td>${item.repo}</td>
                <td>
                    <a href="${item.url}" target="_blank" title="${item.title}">
                        ${this.truncate(item.title, 60)}
                    </a>
                </td>
                <td>#${item.number}</td>
                <td>${item.author}</td>
                <td>${this.formatDate(item.updated)}</td>
                <td>
                    ${item.labels.map(label =>
                        `<span class="label-badge ${label === 'stale' ? 'stale' : ''}">${label}</span>`
                    ).join(' ')}
                </td>
                <td>
                    <a href="${item.url}" target="_blank" class="view-link">View</a>
                </td>
            </tr>
        `).join('');
    }

    formatDate(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }

    truncate(str, maxLength) {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    updateLastUpdated() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('last-updated').textContent = `Last updated: ${timeStr}`;
    }

    showError(message) {
        const tbody = document.getElementById('table-body');
        tbody.innerHTML = `<tr><td colspan="8" class="no-data" style="color: var(--accent-red);">${message}</td></tr>`;
    }

    async loadHistoricalData() {
        try {
            // Try to load historical data files
            // We'll scan for files in data/history directory
            const today = new Date();
            const historyData = [];

            // Try to load data from the last 365 days
            for (let i = 0; i < 365; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];

                try {
                    const response = await fetch(`data/history/${dateStr}.json`);
                    if (response.ok) {
                        const data = await response.json();
                        historyData.push(data);
                    }
                } catch (err) {
                    // File doesn't exist, skip
                    continue;
                }
            }

            if (historyData.length > 0) {
                this.historicalData = historyData.sort((a, b) =>
                    new Date(a.date) - new Date(b.date)
                );
                document.getElementById('trends-panel').style.display = 'block';
                this.updateCharts();
            }
        } catch (error) {
            console.log('Historical data not available yet:', error.message);
        }
    }

    updateCharts() {
        if (this.historicalData.length === 0) return;

        const period = document.getElementById('trend-period').value;
        let data = this.historicalData;

        // Filter by period
        if (period !== 'all') {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - parseInt(period));
            data = this.historicalData.filter(d => new Date(d.date) >= cutoffDate);
        }

        this.renderTrendsChart(data);
        this.renderBreakdownChart(data);
    }

    renderTrendsChart(data) {
        const ctx = document.getElementById('stale-trends-chart');

        // Destroy existing chart
        if (this.charts.trends) {
            this.charts.trends.destroy();
        }

        const dates = data.map(d => d.date);
        const totalStale = data.map(d => d.totals?.totalStale || 0);
        const staleIssues = data.map(d => d.totals?.staleIssues || 0);
        const stalePRs = data.map(d => d.totals?.stalePRs || 0);

        this.charts.trends = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Total Stale Items',
                        data: totalStale,
                        borderColor: '#33b5e5',
                        backgroundColor: 'rgba(51, 181, 229, 0.1)',
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Stale Issues',
                        data: staleIssues,
                        borderColor: '#73bf69',
                        backgroundColor: 'rgba(115, 191, 105, 0.1)',
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Stale PRs',
                        data: stalePRs,
                        borderColor: '#ff9830',
                        backgroundColor: 'rgba(255, 152, 48, 0.1)',
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#d8d9da',
                            font: { size: 12 }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Stale Items Over Time',
                        color: '#d8d9da',
                        font: { size: 14, weight: 'normal' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9fa3a7', maxTicksLimit: 10 },
                        grid: { color: '#2d3138' }
                    },
                    y: {
                        ticks: { color: '#9fa3a7' },
                        grid: { color: '#2d3138' },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderBreakdownChart(data) {
        const ctx = document.getElementById('repo-breakdown-chart');

        // Destroy existing chart
        if (this.charts.breakdown) {
            this.charts.breakdown.destroy();
        }

        // Get latest data point
        const latest = data[data.length - 1];
        if (!latest || !latest.repositories) return;

        const repos = latest.repositories
            .filter(r => r.totalStale > 0)
            .sort((a, b) => b.totalStale - a.totalStale)
            .slice(0, 10); // Top 10 repos

        const labels = repos.map(r => r.repo);
        const staleData = repos.map(r => r.totalStale);
        const colors = [
            '#33b5e5', '#73bf69', '#ff9830', '#e02f44', '#a77ddc',
            '#5bc0de', '#f0ad4e', '#d9534f', '#5cb85c', '#337ab7'
        ];

        this.charts.breakdown = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Stale Items',
                    data: staleData,
                    backgroundColor: colors.slice(0, repos.length),
                    borderColor: colors.slice(0, repos.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Stale Items by Repository (Current)',
                        color: '#d8d9da',
                        font: { size: 14, weight: 'normal' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9fa3a7' },
                        grid: { color: '#2d3138' }
                    },
                    y: {
                        ticks: { color: '#9fa3a7' },
                        grid: { color: '#2d3138' },
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new StaleDashboard();
});
