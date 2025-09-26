// ---------------- Config & State ----------------
const API_BASE = 'http://localhost:3000/api';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null') || {};
let cart = [];
let salesData = [];

// ---------------- Helpers ----------------
function fmtCurrency(v){ return `$${Number(v||0).toFixed(2)}`; }
function el(id){ return document.getElementById(id); }

// ---------------- Products (Customer) ----------------
async function fetchProducts(){
  try{
    const res = await fetch(`${API_BASE}/products`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
    const products = await res.json();
    const tbody = el('product-list'); if(!tbody) return;
    tbody.innerHTML='';
    (products||[]).forEach(p=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${p.id}</td><td>${p.name}</td><td>${fmtCurrency(p.price)}</td><td>${p.stock}</td>`;
      const tdAction=document.createElement('td');
      const btn=document.createElement('button');
      btn.className='btn btn-success btn-sm'; btn.textContent='Add';
      btn.addEventListener('click',()=>addToCart(p.id,p.name,p.price,p.stock));
      tdAction.appendChild(btn); tr.appendChild(tdAction);
      tbody.appendChild(tr);
    });
  }catch(err){ console.error('Error fetching products:',err); }
}

// ---------------- Cart Functions ----------------
function addToCart(id,name,price,stock){
  const existing=cart.find(i=>i.product_id===id);
  if(existing){ if(existing.qty>=stock) return alert('Not enough stock'); existing.qty++; }
  else cart.push({ product_id:id, name, price, qty:1 });
  renderCart();
}

function renderCart(){
  const list=el('cart-list'); if(!list) return;
  list.innerHTML=''; let total=0;
  cart.forEach(item=>{
    total+=item.price*item.qty;
    const li=document.createElement('li');
    li.className='list-group-item d-flex justify-content-between';
    li.innerHTML=`${item.name} x ${item.qty} <span>${fmtCurrency(item.price*item.qty)}</span>`;
    list.appendChild(li);
  });
  el('total') && (el('total').textContent=total.toFixed(2));
}

// ---------------- Customer Checkout ----------------
el('checkoutBtn')?.addEventListener('click',()=>{
  if(!cart.length) return alert('Cart empty');
  const modalEl=el('customerModal'); if(!modalEl) return alert('Customer modal not found');
  new bootstrap.Modal(modalEl).show();
});

el('confirmCheckout')?.addEventListener('click', async ()=>{
  const customer={ 
    name:el('custName')?.value.trim(), 
    address:el('custAddress')?.value.trim(), 
    phone:el('custPhone')?.value.trim() 
  };
  if(!customer.name||!customer.address||!customer.phone) return alert('Enter all customer details');
  if(!cart.length) return alert('Cart empty');

  try{
    const res=await fetch(`${API_BASE}/checkout`,{
      method:'POST',
      headers:{ 'Authorization':token?`Bearer ${token}`:'', 'Content-Type':'application/json' },
      body:JSON.stringify({ items:cart, customer })
    });
    const data=await res.json();
    if(res.ok && data.ok){
      printReceipt(data.sale_id ?? data.id ?? Math.floor(Math.random()*10000), customer, [...cart]);
      cart=[]; renderCart(); fetchProducts(); await fetchSales(); generateReport('daily');
      bootstrap.Modal.getInstance(el('customerModal'))?.hide();
    }else{ alert(data.error || 'Checkout failed.'); }
  }catch(err){ console.error(err); alert('Error during checkout'); }
});

// ---------------- Print Receipt ----------------
function printReceipt(sale_id, customer, items){
  const receiptWin=window.open('','Print','width=300,height=600');
  let html=`<style>
      body{font-family:"Courier New",monospace;font-size:12px;margin:0;padding:10px;}
      h3{margin:0 0 5px 0;}
      .company-customer{display:flex;justify-content:space-between;margin-top:5px;}
      table{width:100%;border-collapse: collapse;margin-top:10px;}
      th,td{padding:3px 5px;text-align:left;}
      th{border-bottom:1px dashed #000;}
      .total{font-weight:bold;margin-top:10px;}
    </style>
    <h3>MXC Trading</h3>
    <div class="company-customer">
      <div class="company">Hargeisa, Somaliland<br>Phone: +252639009404</div>
      <div class="customer">
        <strong>Customer:</strong> ${customer.name}<br>
        <strong>Address:</strong> ${customer.address}<br>
        <strong>Phone:</strong> ${customer.phone}
      </div>
    </div>
    <hr>
    <table>
      <tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>
  `;
  let total=0;
  items.forEach(item=>{
    const itemTotal=item.price*item.qty;
    total+=itemTotal;
    html+=`<tr><td>${item.name}</td><td>${item.qty}</td><td>${fmtCurrency(item.price)}</td><td>${fmtCurrency(itemTotal)}</td></tr>`;
  });
  html+=`<tr><td colspan="3"><strong>Total</strong></td><td><strong>${fmtCurrency(total)}</strong></td></tr></table>`;
  receiptWin.document.write(html); receiptWin.document.close(); receiptWin.print();
}

// ---------------- Admin Panel ----------------
el('adminPanelBtn')?.addEventListener('click',()=>{
  if(user.role!=='admin') return alert('Admin access only');
  fetchAdminProducts(); fetchSales();
  new bootstrap.Modal(el('adminModal')).show();
});

// ---------------- Admin CRUD ----------------
async function fetchAdminProducts(){
  try{
    const res=await fetch(`${API_BASE}/products`, { headers: token?{'Authorization':`Bearer ${token}`}:{} });
    const products=await res.json(); const tbody=el('admin-product-list'); if(!tbody) return;
    tbody.innerHTML='';
    (products||[]).forEach(p=>{
      const tr=document.createElement('tr'); tr.innerHTML=`<td>${p.id}</td>`;
      const tdName=document.createElement('td'); const inpName=document.createElement('input');
      inpName.id=`name${p.id}`; inpName.className='form-control'; inpName.value=p.name; tdName.appendChild(inpName); tr.appendChild(tdName);
      const tdPrice=document.createElement('td'); const inpPrice=document.createElement('input');
      inpPrice.id=`price${p.id}`; inpPrice.className='form-control'; inpPrice.value=p.price; tdPrice.appendChild(inpPrice); tr.appendChild(tdPrice);
      const tdStock=document.createElement('td'); const inpStock=document.createElement('input');
      inpStock.id=`stock${p.id}`; inpStock.className='form-control'; inpStock.value=p.stock; tdStock.appendChild(inpStock); tr.appendChild(tdStock);
      const tdActions=document.createElement('td');
      const saveBtn=document.createElement('button'); saveBtn.className='btn btn-primary btn-sm me-1'; saveBtn.textContent='Save';
      saveBtn.addEventListener('click',()=>updateProduct(p.id));
      const delBtn=document.createElement('button'); delBtn.className='btn btn-danger btn-sm'; delBtn.textContent='Delete';
      delBtn.addEventListener('click',()=>deleteProduct(p.id));
      tdActions.appendChild(saveBtn); tdActions.appendChild(delBtn); tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }catch(err){ console.error(err); }
}

async function addProduct(){
  const name=el('newName')?.value.trim();
  const price=parseFloat(el('newPrice')?.value);
  const stock=parseInt(el('newStock')?.value);
  if(!name || isNaN(price)||isNaN(stock)) return alert('Invalid input');
  try{
    await fetch(`${API_BASE}/products`,{ method:'POST', headers:{ 'Authorization':token?`Bearer ${token}`:'','Content-Type':'application/json' }, body:JSON.stringify({name,price,stock}) });
    el('newName').value=''; el('newPrice').value=''; el('newStock').value='';
    fetchAdminProducts(); fetchProducts();
  }catch(err){ console.error(err); alert('Add failed'); }
}

async function updateProduct(id){
  const name=el(`name${id}`)?.value.trim();
  const price=parseFloat(el(`price${id}`)?.value);
  const stock=parseInt(el(`stock${id}`)?.value);
  try{
    await fetch(`${API_BASE}/products/${id}`,{ method:'PUT', headers:{ 'Authorization':token?`Bearer ${token}`:'','Content-Type':'application/json' }, body:JSON.stringify({name,price,stock}) });
    fetchAdminProducts(); fetchProducts();
  }catch(err){ console.error(err); alert('Update failed'); }
}

async function deleteProduct(id){
  if(!confirm('Delete product?')) return;
  try{
    await fetch(`${API_BASE}/products/${id}`,{ method:'DELETE', headers:{ 'Authorization':token?`Bearer ${token}`:'' } });
    fetchAdminProducts(); fetchProducts();
  }catch(err){ console.error(err); alert('Delete failed'); }
}

// ---------------- Fetch & Render Sales ----------------
async function fetchSales(){
  try{
    const res = await fetch(`${API_BASE}/sales`, { headers: token?{'Authorization':`Bearer ${token}`}:{}} );
    const sales = await res.json();
    salesData = Array.isArray(sales) ? sales : [];
    renderSalesList();
  }catch(err){ console.error(err); }
}

function renderSalesList(){
  const list=el('sales-list'); if(!list) return;
  list.innerHTML='';
  salesData.forEach(s=>{
    const items=s.items || [];
    const itemLine=items.map(i=>`${i.name} x${i.qty}`).join(', ');
    const li=document.createElement('li');
    li.className='list-group-item';
    li.innerHTML=`Sale #${s.id} - ${fmtCurrency(s.total||0)} - ${s.created_at?new Date(s.created_at).toLocaleString():'N/A'}<br>
                  Customer: ${s.customer_name||'N/A'}, ${s.customer_address||''}, ${s.customer_phone||''}<br>
                  Items: ${itemLine}`;
    list.appendChild(li);
  });
}

// ---------------- Generate Admin Report ----------------
function generateReport(period){
  if(!salesData.length){ 
    clearReportDisplays(); 
    return; 
  }

  const now = new Date();
  let filtered = salesData.filter(s => {
    const date = new Date(s.created_at);
    if(period==='daily') return date.toDateString()===now.toDateString();
    if(period==='weekly'){ 
      const weekStart = new Date(now); weekStart.setDate(now.getDate()-now.getDay()); weekStart.setHours(0,0,0,0); 
      return date >= weekStart; 
    }
    if(period==='monthly') return date.getMonth()===now.getMonth() && date.getFullYear()===now.getFullYear();
    if(period==='yearly') return date.getFullYear()===now.getFullYear();
    return true;
  });

  // Aggregate sales by product
  const productTotals = {};
  filtered.forEach(s=>{
    const items = s.items || [];
    items.forEach(i=>{
      if(!productTotals[i.name]) productTotals[i.name] = { price: i.price, qty: 0, total: 0 };
      productTotals[i.name].qty += i.qty;
      productTotals[i.name].total += i.qty*i.price;
    });
  });

  // Render table
  const tbody=document.querySelector('#report-table tbody');
  tbody.innerHTML='';
  let grandTotal=0;
  Object.entries(productTotals).forEach(([name,data])=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${name}</td><td>${data.qty}</td><td>${fmtCurrency(data.price)}</td><td>${fmtCurrency(data.total)}</td>`;
    grandTotal += data.total;
    tbody.appendChild(tr);
  });

  const trTotal=document.createElement('tr');
  trTotal.innerHTML=`<td colspan="3"><strong>Grand Total</strong></td><td><strong>${fmtCurrency(grandTotal)}</strong></td>`;
  tbody.appendChild(trTotal);

  // Render summary
  const bestSeller = Object.entries(productTotals).sort((a,b)=>b[1].qty - a[1].qty)[0]?.[0] || '—';
  const salesCount = filtered.length;
  const avgSale = salesCount ? grandTotal/salesCount : 0;

  renderReportSummary({ totalRevenue: grandTotal, salesCount, avgSale, bestSeller });
}

// ---------------- Report Summary ----------------
function clearReportDisplays(){ 
  const elSummary = el('report-summary'); if(elSummary) elSummary.innerHTML='';
  const tbody = document.querySelector('#report-table tbody');
  if(tbody) tbody.innerHTML='<tr><td colspan="4" class="text-muted">No data</td></tr>';
}

function renderReportSummary({totalRevenue,salesCount,avgSale,bestSeller}){
  const elSummary = el('report-summary'); if(!elSummary) return;
  elSummary.innerHTML = `
    <div><strong>Total revenue:</strong> ${fmtCurrency(totalRevenue)}</div>
    <div><strong>Number of sales:</strong> ${salesCount}</div>
    <div><strong>Average sale value:</strong> ${fmtCurrency(avgSale)}</div>
    <div><strong>Best seller:</strong> ${bestSeller}</div>
  `;
}

// ---------------- Export PDF ----------------
function exportReportPDF(){
  const table=el('report-table'); 
  if(!table) return alert('No table to export');
  if(!window.html2pdf){ alert('html2pdf.js not loaded'); return; }
  html2pdf().from(table).set({ margin:1, filename:'report.pdf', html2canvas:{ scale:2 } }).save();
}

el('exportPdfBtn')?.addEventListener('click',exportReportPDF);

// ---------------- Initialize ----------------
fetchProducts();
if(user.role==='admin'){ fetchAdminProducts(); fetchSales(); generateReport('daily'); }
