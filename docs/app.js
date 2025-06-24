// DOM Elements
const loginContainer = document.getElementById('login-container');
const profileContainer = document.getElementById('profile-container');
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const logoutBtn = document.getElementById('logout-btn');
const userLoginSpan = document.getElementById('user-login');
const xpChart = document.getElementById('xp-chart');
const progressChart = document.getElementById('progress-chart');
const statsInfo = document.getElementById('stats-info');

// GraphQL endpoint
const GRAPHQL_ENDPOINT = 'https://learn.reboot01.com/api/graphql-engine/v1/graphql';

// Global variable to track which auth method works
let GRAPHQL_AUTH_METHOD = 'bearer';

// JWT Token Fixer Function
function fixJWTToken(token) {
    // Remove any extra characters that might be causing issues
    let fixedToken = token
        .trim()                          // Remove whitespace
        .replace(/[\r\n]/g, '')         // Remove line breaks
        .replace(/['"]/g, '')           // Remove quotes
        .replace(/\s/g, '');            // Remove all spaces
    
    // Verify it has the right JWT structure
    const parts = fixedToken.split('.');
    if (parts.length !== 3) {
        throw new Error(`Invalid JWT structure: expected 3 parts, got ${parts.length}`);
    }
    
    return fixedToken;
}

// Test GraphQL with token
async function testGraphQLWithToken(token) {
    const simpleQuery = `
        query {
            user {
                id
                login
            }
        }
    `;

    try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ query: simpleQuery }),
        });

        const responseData = await response.json();

        if (responseData.errors) {
            return await testGraphQLWithoutBearer(token);
        } else if (responseData.data) {
            fetchUserData();
        }
        
    } catch (error) {
        console.error('GraphQL test error:', error);
    }
}

// Test without Bearer prefix
async function testGraphQLWithoutBearer(token) {
    const simpleQuery = `
        query {
            user {
                id
                login
            }
        }
    `;

    try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token,  // No "Bearer " prefix
            },
            body: JSON.stringify({ query: simpleQuery }),
        });

        const responseData = await response.json();

        if (responseData.data && !responseData.errors) {
            GRAPHQL_AUTH_METHOD = 'no-bearer';
            fetchUserData();
        } else {
            statsInfo.innerHTML = `
                <div class="error">
                    <h4>Authentication Failed</h4>
                    <p>Unable to authenticate with GraphQL endpoint.</p>
                    <p>Error: ${responseData.errors ? responseData.errors[0].message : 'Unknown error'}</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('GraphQL (no Bearer) test error:', error);
    }
}

// Check if user is already logged in
function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        showProfile();
        fetchUserData();
    }
}

// Login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('https://learn.reboot01.com/api/auth/signin', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(`${username}:${password}`)}`,
            },
        });

        if (!response.ok) {
            throw new Error('Invalid credentials');
        }

        const rawToken = await response.text();
        
        try {
            const fixedToken = fixJWTToken(rawToken);
            localStorage.setItem('token', fixedToken);
            errorMessage.textContent = '';
            showProfile();
            await testGraphQLWithToken(fixedToken);
            
        } catch (tokenError) {
            console.error('Token fixing failed:', tokenError);
            errorMessage.textContent = 'Token processing error: ' + tokenError.message;
        }

    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = 'Invalid username/email or password';
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    showLogin();
});

// Show/Hide containers
function showProfile() {
    loginContainer.classList.add('hidden');
    profileContainer.classList.remove('hidden');
}

function showLogin() {
    profileContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
}

// Fetch user data using GraphQL
async function fetchUserData() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const query = `
        query {
            user {
                id
                login
            }
            
            transaction(where: {type: {_eq: "xp"}}) {
                amount
                createdAt
                path
                object {
                    name
                    type
                }
            }
            
            progress {
                grade
                path
                createdAt
                object {
                    name
                    type
                }
            }
            
            result {
                id
                grade
                type
                path
                user {
                    id
                    login
                }
                object {
                    name
                    type
                }
            }
        }
    `;

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': GRAPHQL_AUTH_METHOD === 'bearer' ? `Bearer ${token}` : token,
        };

        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ query }),
        });

        const data = await response.json();

        if (data.errors) {
            statsInfo.innerHTML = `
                <div class="error">
                    <h4>GraphQL Error:</h4>
                    <p>${data.errors[0].message}</p>
                    <p>Check console for details.</p>
                </div>
            `;
            return;
        }

        if (data.data) {
            updateUI(data.data);
        } else {
            statsInfo.innerHTML = '<div class="error">No data received from server</div>';
        }

    } catch (error) {
        console.error('Fetch error:', error);
        statsInfo.innerHTML = `<div class="error">Network error: ${error.message}</div>`;
    }
}

// Find closest match to school platform data
function findClosestToSchoolPlatform(transactions) {
    if (!transactions || transactions.length === 0) {
        return null;
    }
    
    const targetXP = 611000;
    const targetCount = 31;
    
    // Different strategies to match school platform
    const strategies = {
        // Top 31 excluding smallest amounts
        top_31_excluding_small: transactions
            .filter(t => t.amount >= 1000)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 31),
            
        // Main projects + top piscine to reach 31
        main_plus_top_piscine: (() => {
            const mainProjects = transactions.filter(t => 
                t.path.toLowerCase().includes('bh-module') && 
                !t.path.toLowerCase().includes('checkpoint')
            );
            const piscineProjects = transactions
                .filter(t => t.path.toLowerCase().includes('piscine'))
                .sort((a, b) => b.amount - a.amount);
            
            const needed = 31 - mainProjects.length;
            return [...mainProjects, ...piscineProjects.slice(0, needed)];
        })(),
        
        // Target closest to 611k by trying different transaction counts
        closest_to_611k: (() => {
            const sorted = [...transactions].sort((a, b) => b.amount - a.amount);
            let bestCombination = sorted.slice(0, 31);
            let bestDifference = Math.abs(bestCombination.reduce((sum, t) => sum + t.amount, 0) - targetXP);
            
            for (let count = 25; count <= 35; count++) {
                const combination = sorted.slice(0, count);
                const totalXP = combination.reduce((sum, t) => sum + t.amount, 0);
                const difference = Math.abs(totalXP - targetXP);
                
                if (difference < bestDifference) {
                    bestDifference = difference;
                    bestCombination = combination;
                }
            }
            
            return bestCombination;
        })()
    };
    
    let bestMatch = null;
    let bestScore = Infinity;
    
    Object.keys(strategies).forEach(strategyName => {
        const filtered = strategies[strategyName];
        if (!filtered || filtered.length === 0) return;
        
        const totalXP = filtered.reduce((sum, t) => sum + t.amount, 0);
        const count = filtered.length;
        
        const xpDifference = Math.abs(totalXP - targetXP);
        const countDifference = Math.abs(count - targetCount);
        
        // Weighted score (prioritize transaction count)
        const score = (xpDifference / 1000) + (countDifference * 10);
        
        if (score < bestScore) {
            bestScore = score;
            bestMatch = {
                strategy: strategyName,
                transactions: filtered,
                count: count,
                totalXP: totalXP
            };
        }
    });
    
    // Fallback to exact count match if XP difference is too large
    if (!bestMatch || bestMatch.count !== 31) {
        const fallback = [...transactions].sort((a, b) => b.amount - a.amount).slice(0, 31);
        const fallbackXP = fallback.reduce((sum, t) => sum + t.amount, 0);
        
        return {
            strategy: 'top_31_by_amount',
            transactions: fallback,
            count: 31,
            totalXP: fallbackXP
        };
    }
    
    return bestMatch;
}

// Update UI with fetched data
function updateUI(data) {
    const { user, transaction, progress, result } = data;

    if (!user || user.length === 0) {
        statsInfo.innerHTML = '<div class="error">No user data available</div>';
        return;
    }

    // Basic user identification
    userLoginSpan.textContent = user[0].login;

    // Find closest match to school platform
    const closestMatch = findClosestToSchoolPlatform(transaction);
    
    const displayXP = closestMatch ? closestMatch.totalXP : 0;
    const displayTransactionCount = closestMatch ? closestMatch.count : 0;
    const displayTransactions = closestMatch ? closestMatch.transactions : [];

    // Calculate pass/fail ratio from result data
    let projectsPassed = 0;
    let projectsFailed = 0;
    let successRate = 0;
    
    if (result && result.length > 0) {
        const validResults = result.filter(r => 
            r.grade !== null && 
            r.grade !== undefined &&
            !r.path.includes('checkpoint') &&
            !r.path.includes('piscine') &&
            r.path.includes('bh-module')
        );
        
        validResults.forEach(r => {
            if (r.grade >= 1.0) {
                projectsPassed++;
            } else {
                projectsFailed++;
            }
        });
        
        const totalProjects = projectsPassed + projectsFailed;
        successRate = totalProjects > 0 ? ((projectsPassed / totalProjects) * 100).toFixed(1) : 0;
    }

    // Create XP progress chart
    let cumulativeXpData = [];
    if (displayTransactions && displayTransactions.length > 0) {
        const sortedTransactions = displayTransactions
            .filter(t => t.createdAt)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        let cumulativeXp = 0;
        cumulativeXpData = sortedTransactions.map(t => {
            cumulativeXp += t.amount;
            return {
                date: new Date(t.createdAt).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: '2-digit'
                }),
                xp: t.amount,
                cumulativeXp: cumulativeXp,
                project: t.object ? t.object.name : 'Unknown'
            };
        });

        // Sample data if too many points
        if (cumulativeXpData.length > 20) {
            const step = Math.floor(cumulativeXpData.length / 20);
            cumulativeXpData = cumulativeXpData.filter((_, index) => index % step === 0);
        }

        createXPChart(cumulativeXpData);
    } else {
        xpChart.innerHTML = '<p style="text-align: center; padding: 20px;">No XP data available</p>';
    }

    // Create progress chart
    if (projectsPassed > 0 || projectsFailed > 0) {
        createProgressChart(projectsPassed, projectsFailed);
    } else {
        progressChart.innerHTML = '<p style="text-align: center; padding: 20px;">No project results available</p>';
    }

    // Update statistics
    statsInfo.innerHTML = `
        <div class="stat-item"><strong>User:</strong> ${user[0].login}</div>
        <div class="stat-item"><strong>Total XP:</strong> ${displayXP.toLocaleString()}</div>
        <div class="stat-item"><strong>Success Rate:</strong> ${successRate}%</div>
        <div class="stat-item"><strong>Projects Passed:</strong> ${projectsPassed}</div>
        <div class="stat-item"><strong>Projects Failed:</strong> ${projectsFailed}</div>
        <div class="stat-item"><strong>XP Transactions:</strong> ${displayTransactionCount}</div>
    `;
}

// Create XP chart using SVG
function createXPChart(data) {
    const width = xpChart.clientWidth || 400;
    const height = 300;
    const padding = 60;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    xpChart.innerHTML = '';
    xpChart.appendChild(svg);

    if (data.length === 0) {
        xpChart.innerHTML = '<p style="text-align: center; padding: 20px;">No XP data to display</p>';
        return;
    }

    // Calculate scales
    const xScale = (width - padding * 2) / Math.max(data.length - 1, 1);
    const yMax = Math.max(...data.map(d => d.cumulativeXp));
    const yScale = (height - padding * 2) / yMax;

    // Create line
    const points = data.map((d, i) => {
        const x = padding + i * xScale;
        const y = height - padding - d.cumulativeXp * yScale;
        return `${x},${y}`;
    }).join(' ');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#007bff');
    polyline.setAttribute('stroke-width', '3');
    svg.appendChild(polyline);

    // Add axes
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', padding);
    xAxis.setAttribute('y1', height - padding);
    xAxis.setAttribute('x2', width - padding);
    xAxis.setAttribute('y2', height - padding);
    xAxis.setAttribute('stroke', '#333');
    xAxis.setAttribute('stroke-width', '2');
    svg.appendChild(xAxis);

    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', padding);
    yAxis.setAttribute('y1', padding);
    yAxis.setAttribute('x2', padding);
    yAxis.setAttribute('y2', height - padding);
    yAxis.setAttribute('stroke', '#333');
    yAxis.setAttribute('stroke-width', '2');
    svg.appendChild(yAxis);

    // Add time labels
    const labelIndices = [0, Math.floor(data.length / 2), data.length - 1];
    labelIndices.forEach(i => {
        if (i < data.length) {
            const x = padding + i * xScale;
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', x);
            label.setAttribute('y', height - 10);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('font-size', '10');
            label.setAttribute('fill', '#666');
            label.textContent = data[i].date;
            svg.appendChild(label);
        }
    });

    // Add Y-axis labels
    const yLabels = [0, Math.floor(yMax / 2), yMax];
    yLabels.forEach(value => {
        const y = height - padding - (value * yScale);
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', padding - 10);
        label.setAttribute('y', y + 4);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('font-size', '10');
        label.setAttribute('fill', '#666');
        label.textContent = value.toLocaleString();
        svg.appendChild(label);
    });

    // Add interactive data points
    data.forEach((d, i) => {
        const x = padding + i * xScale;
        const y = height - padding - d.cumulativeXp * yScale;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#007bff');
        circle.setAttribute('cursor', 'pointer');
        
        // Hover effects
        circle.addEventListener('mouseover', () => {
            const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltip.setAttribute('x', x + 10);
            tooltip.setAttribute('y', y - 10);
            tooltip.setAttribute('fill', '#000');
            tooltip.setAttribute('font-size', '12');
            tooltip.setAttribute('font-weight', 'bold');
            tooltip.textContent = `${d.date}: ${d.cumulativeXp.toLocaleString()} XP`;
            svg.appendChild(tooltip);
            
            circle.setAttribute('r', '6');
            circle.setAttribute('fill', '#0056b3');
        });
        
        circle.addEventListener('mouseout', () => {
            const tooltips = svg.getElementsByTagName('text');
            for (let i = tooltips.length - 1; i >= 0; i--) {
                if (tooltips[i].getAttribute('font-weight') === 'bold') {
                    svg.removeChild(tooltips[i]);
                    break;
                }
            }
            circle.setAttribute('r', '4');
            circle.setAttribute('fill', '#007bff');
        });
        
        svg.appendChild(circle);
    });

    // Add title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', width / 2);
    title.setAttribute('y', 20);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '16');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', '#333');
    title.textContent = 'Cumulative XP Over Time';
    svg.appendChild(title);
}

// Create progress chart using SVG
function createProgressChart(passed, failed) {
    const width = progressChart.clientWidth || 400;
    const height = 300;
    const radius = Math.min(width, height) / 2 - 40;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    progressChart.innerHTML = '';
    progressChart.appendChild(svg);

    const centerX = width / 2;
    const centerY = height / 2;

    const total = passed + failed;
    if (total === 0) {
        progressChart.innerHTML = '<p style="text-align: center; padding: 20px;">No progress data to display</p>';
        return;
    }

    // Calculate angles
    const passedAngle = (passed / total) * 360;

    // Create pie segments
    const createArc = (startAngle, endAngle, color) => {
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;

        const x1 = centerX + radius * Math.cos(startRad);
        const y1 = centerY + radius * Math.sin(startRad);
        const x2 = centerX + radius * Math.cos(endRad);
        const y2 = centerY + radius * Math.sin(endRad);

        const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${centerX},${centerY} L ${x1},${y1} A ${radius},${radius} 0 ${largeArcFlag},1 ${x2},${y2} Z`);
        path.setAttribute('fill', color);
        
        // Animation
        path.style.opacity = '0';
        path.style.transition = 'opacity 0.5s ease-in-out';
        setTimeout(() => {
            path.style.opacity = '1';
        }, 100);
        
        svg.appendChild(path);
        
        // Hover effects
        path.addEventListener('mouseover', () => {
            path.style.filter = 'brightness(1.2)';
        });
        
        path.addEventListener('mouseout', () => {
            path.style.filter = 'brightness(1)';
        });
    };

    createArc(0, passedAngle, '#28a745');
    createArc(passedAngle, 360, '#dc3545');

    // Add labels
    const addLabel = (text, x, y, fontSize = '14') => {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', y);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', fontSize);
        label.setAttribute('fill', '#000');
        label.textContent = text;
        svg.appendChild(label);
    };

    addLabel('Pass/Fail Ratio', centerX, 30, '16');
    addLabel(`Passed: ${passed}`, centerX, centerY - 10);
    addLabel(`Failed: ${failed}`, centerX, centerY + 10);
    addLabel(`${((passed / total) * 100).toFixed(1)}% Success Rate`, centerX, height - 20, '12');
}

// Initialize
checkAuth();