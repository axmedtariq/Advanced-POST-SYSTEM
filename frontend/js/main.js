// ---------------- Config & State ----------------
const API_BASE = 'http://localhost:3000/api';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null') || {};
let cart = [];
let salesData = [];

// ---------------- Helpers ----------------
function el(id){ return document.getElementById(id); }
function fmtCurrency(v){ return `$${Number(v||0).toFixed(2)}`; }

// ---------------- Export PDF with Title ----------------
el('exportPdfBtn')?.addEventListener('click', () => {
  const reportTable = el('report-table');
  const summaryText = el('report-summary').innerText;
  const reportTitle = reportTable?.getAttribute('data-report-title') || 'Sales Report';
  const currentDate = new Date().toLocaleDateString();

  // Temporary container for PDF content
  const tempDiv = document.createElement('div');

  // Add title
  const titleEl = document.createElement('h3');
  titleEl.innerText = `${reportTitle} – ${currentDate}`;
  titleEl.style.textAlign = 'center';
  titleEl.style.marginBottom = '10px';
  tempDiv.appendChild(titleEl);

  // Add cloned table
  tempDiv.appendChild(reportTable.cloneNode(true));

  // Add summary
  if(summaryText){
    const summaryEl = document.createElement('p');
    summaryEl.style.fontWeight = 'bold';
    summaryEl.style.marginTop = '10px';
    summaryEl.innerText = summaryText;
    tempDiv.appendChild(summaryEl);
  }

  html2pdf()
    .set({
      margin: 10,
      filename: `${reportTitle.replace(/\s/g,'_')}_${currentDate}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .from(tempDiv)
    .save();
});

// ---------------- Logout ----------------
el('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
});

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
el('checkoutBtn')?.addEventListener('click',()=> {
  if(!cart.length) return alert('Cart empty');
  const modalEl = el('customerModal');
  if(!modalEl) return alert('Customer modal not found');
  new bootstrap.Modal(modalEl).show();
});

el('confirmCheckout')?.addEventListener('click', async ()=> {
  const customer={
    name: el('custName')?.value.trim(),
    address: el('custAddress')?.value.trim(),
    phone: el('custPhone')?.value.trim()
  };
  if(!customer.name||!customer.address||!customer.phone) return alert('Enter all customer details');
  if(!cart.length) return alert('Cart empty');

  try{
    const res = await fetch(`${API_BASE}/checkout`, {
      method:'POST',
      headers:{ 'Authorization': token?`Bearer ${token}`:'', 'Content-Type':'application/json' },
      body: JSON.stringify({ items: cart, customer })
    });
    const data = await res.json();
    if(res.ok && data.ok){
      printReceipt(data.sale_id ?? Math.floor(Math.random()*10000), customer, [...cart]);
      cart=[]; renderCart(); fetchProducts(); await fetchSales(); generateReport('daily');
      bootstrap.Modal.getInstance(el('customerModal'))?.hide();
    } else {
      alert(data.error || 'Checkout failed.');
    }
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
el('adminPanelBtn')?.addEventListener('click',()=> {
  if(user.role!=='admin') return alert('Admin access only');
  fetchAdminProducts(); fetchSales(); generateReport('daily');
  new bootstrap.Modal(el('adminModal')).show();
});

// ---------------- Admin CRUD ----------------
async function fetchAdminProducts(){
  try{
    const res = await fetch(`${API_BASE}/products`, { headers: token?{'Authorization':`Bearer ${token}`}:{} });
    const products = await res.json(); const tbody = el('admin-product-list'); if(!tbody) return;
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

el('addProductBtn')?.addEventListener('click', addProduct);

async function addProduct(){
  const name=el('newName')?.value.trim();
  const price=parseFloat(el('newPrice')?.value);
  const stock=parseInt(el('newStock')?.value);
  if(!name||isNaN(price)||isNaN(stock)) return alert('Invalid input');

  try{
    const res = await fetch(`${API_BASE}/products`,{
      method:'POST',
      headers:{ 'Authorization': token?`Bearer ${token}`:'','Content-Type':'application/json' },
      body: JSON.stringify({name,price,stock})
    });
    const data = await res.json();
    if(data.ok){
      el('newName').value=''; el('newPrice').value=''; el('newStock').value='';
      fetchAdminProducts(); fetchProducts();
    } else { alert(data.error || 'Add failed'); }
  }catch(err){ console.error(err); alert('Error adding product'); }
}

async function updateProduct(id){
  const name=el(`name${id}`)?.value.trim();
  const price=parseFloat(el(`price${id}`)?.value);
  const stock=parseInt(el(`stock${id}`)?.value);
  try{
    const res = await fetch(`${API_BASE}/products/${id}`,{
      method:'PUT',
      headers:{ 'Authorization': token?`Bearer ${token}`:'','Content-Type':'application/json' },
      body: JSON.stringify({name,price,stock})
    });
    const data=await res.json();
    if(data.ok) fetchAdminProducts();
    else alert(data.error || 'Update failed');
  }catch(err){ console.error(err); alert('Error updating product'); }
}

async function deleteProduct(id){
  if(!confirm('Delete product?')) return;
  try{
    const res = await fetch(`${API_BASE}/products/${id}`,{
      method:'DELETE',
      headers:{ 'Authorization': token?`Bearer ${token}`:'' }
    });
    const data = await res.json();
    if(data.ok) fetchAdminProducts(); else alert(data.error||'Delete failed');
  }catch(err){ console.error(err); alert('Error deleting product'); }
}

// ---------------- Sales Reports ----------------
async function fetchSales(){
  try{
    const res = await fetch(`${API_BASE}/sales`,{ headers: token?{'Authorization':`Bearer ${token}`}:{} });
    salesData = await res.json();
  }catch(err){ console.error(err); salesData=[]; }
}

function generateReport(type='daily'){
  const table = el('report-table'); 
  const tbody = table?.querySelector('tbody');
  if(!tbody) return;
  tbody.innerHTML='';

  // Set report title for export
  const titleMap = { daily:'Daily Sales Report', weekly:'Weekly Sales Report', monthly:'Monthly Sales Report', yearly:'Yearly Sales Report' };
  table.setAttribute('data-report-title', titleMap[type]||'Sales Report');

  // Filter sales by type
  const now = new Date();
  const data = (salesData||[]).filter(sale=>{
    const saleDate = new Date(sale.created_at);
    switch(type){
      case 'daily': return saleDate.toDateString() === now.toDateString();
      case 'weekly': {
        const oneWeekAgo = new Date(); oneWeekAgo.setDate(now.getDate()-7);
        return saleDate >= oneWeekAgo;
      }
      case 'monthly': return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
      case 'yearly': return saleDate.getFullYear() === now.getFullYear();
      default: return true;
    }
  });

  let totalQty = 0, totalAmount = 0;

  data.forEach(sale=>{
    (sale.items||[]).forEach(item=>{
      const tr = document.createElement('tr');
      const itemTotal = item.qty*item.price;
      totalQty += item.qty;
      totalAmount += itemTotal;
      tr.innerHTML = `<td>${item.name}</td><td>${item.qty}</td><td>${fmtCurrency(item.price)}</td><td>${fmtCurrency(itemTotal)}</td>`;
      tbody.appendChild(tr);
    });
  });

  if(!data.length){
    const tr = document.createElement('tr');
    tr.innerHTML=`<td colspan="4" class="text-muted">No data</td>`;
    tbody.appendChild(tr);
  }

  // Update summary
  const summary = el('report-summary');
  if(summary) summary.innerText = `Total Qty: ${totalQty}, Total Amount: ${fmtCurrency(totalAmount)}`;
}

// ---------------- Initialize ----------------
if(token){
  fetchProducts();
} else {
  window.location.href='login.html';
}
