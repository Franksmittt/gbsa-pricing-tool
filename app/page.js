'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, AlertTriangle, DollarSign, Percent, Search, Download, Printer, Upload, Check, RotateCcw } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- CONFIGURATION (/config/data.ts) ---
const VAT_RATE = 0.15;
const BRANCHES = ['Alberton', 'Vanderbijlpark', 'Sasolburg'];

const INTERNAL_SKU_CATEGORIES = [
  "610", "611", "612", "615", "616", "619", "621", "622", "628", "630", "631", "634", "636", "636CS / HT", "638", "639", "640 / 643", "646", "651", "652", "652PS 75Ah", "657", "659", "650", "658", "668", "669", "674", "682", "683", "689", "690", "692", "695", "696", "SMF100 / 674TP", "SMF101 / 674SP", "612AGM", "646AGM", "652AGM", "668AGM", "658AGM", "RR0", "RR1"
];

const INITIAL_SUPPLIERS = [
  { id: 's1', name: 'Exide' },
  { id: 's2', name: 'Willard' },
  { id: 's3', name: 'Electro City' },
  { id: 's4', name: 'Enertec' },
];

const INITIAL_SUPPLIER_PRODUCTS = [
  // SKU 619
  { id: 'p1', supplierId: 's1', supplierSku: '619', internalSku: '619', invoicePrice: 900, supplierType: 'Scrap-Loaded', scrapType: 'none' },
  { id: 'p2', supplierId: 's2', supplierSku: '619', internalSku: '619', invoicePrice: 950, supplierType: 'Scrap-Loaded', scrapType: 'none' },
  { id: 'p3', supplierId: 's3', supplierSku: 'EC-619', internalSku: '619', invoicePrice: 700, supplierType: 'Local/Import', scrapType: 'standard' },
  // SKU 628
  { id: 'p6', supplierId: 's1', supplierSku: '628', internalSku: '628', invoicePrice: 1100, supplierType: 'Scrap-Loaded', scrapType: 'none' },
  { id: 'p7', supplierId: 's2', supplierSku: '628', internalSku: '628', invoicePrice: 1150, supplierType: 'Scrap-Loaded', scrapType: 'none' },
  { id: 'p8', supplierId: 's4', supplierSku: 'EN-628', internalSku: '628', invoicePrice: 850, supplierType: 'Local/Import', scrapType: 'standard' },
  // SKU 652
  { id: 'p9', supplierId: 's1', supplierSku: '652', internalSku: '652', invoicePrice: 1500, supplierType: 'Scrap-Loaded', scrapType: 'none' },
  { id: 'p10', supplierId: 's2', supplierSku: '652', internalSku: '652', invoicePrice: 1550, supplierType: 'Scrap-Loaded', scrapType: 'none' },
  { id: 'p11', supplierId: 's3', supplierSku: 'EC-652', internalSku: '652', invoicePrice: 1200, supplierType: 'Local/Import', scrapType: 'large' },
  // SKU 668 (Anchor only)
  { id: 'p12', supplierId: 's1', supplierSku: '668', internalSku: '668', invoicePrice: 1800, supplierType: 'Scrap-Loaded', scrapType: 'none' },
];

const ANCHOR_BRANDS = ['Exide', 'Willard'];
const HOUSE_BRANDS = ['Global 12', 'Novax 18', 'Novax Premium'];
const ALL_BRANDS = [...ANCHOR_BRANDS, ...HOUSE_BRANDS];

const SCRAP_VALUES = {
  standard: 150,
  large: 250,
  none: 0,
};

// --- UTILITY FUNCTIONS (/lib/utils.ts) ---

const getAdjustedCost = (product) => {
  if (product.supplierType === 'Scrap-Loaded') {
    return product.invoicePrice;
  }
  return product.invoicePrice - (SCRAP_VALUES[product.scrapType] || 0);
};

const formatCurrency = (amount) => {
  if (typeof amount !== 'number' || isNaN(amount)) return "N/A";
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
};

const roundToNearest = (value, nearest) => {
    if (nearest === 0) return value;
    return Math.round(value / nearest) * nearest;
};


// --- REUSABLE UI COMPONENTS ---

const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl shadow-md overflow-hidden ${className}`}>
    <div className="p-6 md:p-8">{children}</div>
  </div>
);

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
  const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-start pt-16 sm:items-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg transform transition-all" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-100">
            <X size={24} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

// --- MODALS (/components/modals/*) ---

const ProductEditModal = ({ isOpen, onClose, product, suppliers, onSave }) => {
  const [formData, setFormData] = useState(null);

  useEffect(() => {
    if (product) {
        if (product.supplierType === 'Scrap-Loaded' && product.scrapType !== 'none') {
            setFormData({...product, scrapType: 'none'});
        } else {
            setFormData(product);
        }
    } else {
        setFormData(null);
    }
  }, [product]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
        const updated = { ...prev, [name]: name === 'invoicePrice' ? parseFloat(value) || 0 : value };
        if (name === 'supplierType' && value === 'Scrap-Loaded') {
            updated.scrapType = 'none';
        }
        return updated;
    });
  };

  const handleSave = () => {
    if (formData) {
        onSave(formData);
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={product ? (product.id ? "Edit Product" : "Add New Product") : ""}>
      {formData && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Supplier</label>
            <select name="supplierId" value={formData.supplierId} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Supplier SKU</label>
            <input type="text" name="supplierSku" value={formData.supplierSku} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Internal SKU (for Grouping)</label>
            <select name="internalSku" value={formData.internalSku} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                <option value="">Select a Category</option>
                {INTERNAL_SKU_CATEGORIES.map(sku => <option key={sku} value={sku}>{sku}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Invoice Price (Excl. VAT)</label>
            <input type="number" name="invoicePrice" value={formData.invoicePrice} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Supplier Type</label>
            <select name="supplierType" value={formData.supplierType} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                <option value="Local/Import">Local / Import (No Scrap Load)</option>
                <option value="Scrap-Loaded">Scrap-Loaded (Exide/Willard)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Scrap Type (Deduction)</label>
            <select 
                name="scrapType" 
                value={formData.scrapType} 
                onChange={handleChange} 
                className="mt-1 block w-full p-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                disabled={formData.supplierType === 'Scrap-Loaded'}
            >
              <option value="none">No Scrap</option>
              <option value="standard">Standard (R{SCRAP_VALUES.standard})</option>
              <option value="large">Large (R{SCRAP_VALUES.large})</option>
            </select>
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <Button onClick={onClose} variant="secondary">Cancel</Button>
            <Button onClick={handleSave} variant="primary">Save Changes</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

const SupplierEditModal = ({ isOpen, onClose, supplier, onSave, onDelete, isDeletable }) => {
    const [name, setName] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        if (supplier) {
            setName(supplier.name);
        }
        setShowConfirm(false);
    }, [supplier]);

    if (!isOpen || !supplier) return null;

    const handleSave = () => {
        onSave({ ...supplier, name });
        onClose();
    };

    const handleDeleteClick = () => {
        setShowConfirm(true);
    };

    const confirmDelete = () => {
        onDelete(supplier.id);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={supplier.id ? "Edit Supplier" : "Add New Supplier"}>
            {!showConfirm ? (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Supplier Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                        />
                    </div>
                    <div className="flex justify-between items-center pt-4">
                        <div>
                            {supplier.id && (
                                <Button onClick={handleDeleteClick} variant="danger" disabled={!isDeletable}>
                                    <Trash2 size={16} /> Delete
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-4">
                            <Button onClick={onClose} variant="secondary">Cancel</Button>
                            <Button onClick={handleSave} variant="primary">Save</Button>
                        </div>
                    </div>
                    {!isDeletable && supplier.id && <p className="text-xs text-yellow-600 mt-2 flex items-center gap-2"><AlertTriangle size={14}/> Cannot delete supplier with associated products.</p>}
                </div>
            ) : (
                <div>
                    <p className="text-gray-700">Are you sure you want to delete the supplier &quot;{supplier.name}&quot;? This action cannot be undone.</p>
                    <div className="flex justify-end gap-4 pt-6">
                        <Button onClick={() => setShowConfirm(false)} variant="secondary">Cancel</Button>
                        <Button onClick={confirmDelete} variant="danger">Confirm Delete</Button>
                    </div>
                </div>
            )}
        </Modal>
    );
};


// --- VIEWS (/components/views/*) ---

const SupplierCostView = ({ suppliers, supplierProducts, onProductUpdate, onProductAdd, onProductDelete, onSupplierUpdate, onSupplierAdd, onSupplierDelete }) => {
  const [activeSupplierId, setActiveSupplierId] = useState(suppliers[0]?.id);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const activeSupplier = useMemo(() => suppliers.find(s => s.id === activeSupplierId), [suppliers, activeSupplierId]);
  
  const productsForSupplier = useMemo(() => supplierProducts.filter(p => p.supplierId === activeSupplierId), [supplierProducts, activeSupplierId]);

  const handleExportCsv = () => {
    if (!activeSupplier) return;

    const headers = ['SKU (Internal)', 'SKU (Supplier)', 'Invoice Price', 'Scrap Deduction', 'Adjusted Cost'];

    const rows = productsForSupplier.map(product => {
      const invoicePrice = product.invoicePrice.toFixed(2);
      const scrapDeduction = (product.supplierType === 'Local/Import' ? SCRAP_VALUES[product.scrapType] || 0 : 0).toFixed(2);
      const adjustedCost = getAdjustedCost(product).toFixed(2);
      
      return [
        product.internalSku,
        product.supplierSku,
        invoicePrice,
        scrapDeduction,
        adjustedCost
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileName = `Supplier_Costs_${activeSupplier.name.replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setIsProductModalOpen(true);
  };

  const handleAddNewProduct = () => {
    setEditingProduct({
        id: '',
        supplierId: activeSupplierId,
        supplierSku: '',
        internalSku: INTERNAL_SKU_CATEGORIES[0],
        invoicePrice: 0,
        supplierType: ANCHOR_BRANDS.includes(activeSupplier?.name) ? 'Scrap-Loaded' : 'Local/Import',
        scrapType: 'standard'
    });
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = (productData) => {
    if (productData.id) {
        onProductUpdate(productData);
    } else {
        onProductAdd({...productData, id: `p${Date.now()}`});
    }
  };

  const handleEditSupplier = (supplier) => {
    setEditingSupplier(supplier);
    setIsSupplierModalOpen(true);
  }

  const handleAddSupplier = () => {
    setEditingSupplier({ id: '', name: '' });
    setIsSupplierModalOpen(true);
  }

  const handleSaveSupplier = (supplierData) => {
    if (supplierData.id) {
        onSupplierUpdate(supplierData);
    } else {
        onSupplierAdd({ ...supplierData, id: `s${Date.now()}` });
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Supplier Costs</h2>
        <div className="flex flex-wrap gap-2">
            <Button onClick={handleExportCsv} variant="secondary" disabled={!activeSupplierId || productsForSupplier.length === 0}> <Download size={16} /> Export CSV </Button>
            <Button onClick={handleAddSupplier} variant="secondary"><Plus size={16} /> Add Supplier</Button>
            <Button onClick={handleAddNewProduct} variant="primary" disabled={!activeSupplierId}><Plus size={16} /> Add Product</Button>
        </div>
      </div>
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-2 overflow-x-auto" aria-label="Tabs">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="relative group">
                <button
                  onClick={() => setActiveSupplierId(supplier.id)}
                  className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                    activeSupplierId === supplier.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {supplier.name}
                </button>
                <button onClick={() => handleEditSupplier(supplier)} className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil size={12} className="text-gray-400 hover:text-blue-600" />
                </button>
            </div>
          ))}
        </nav>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU (Internal)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU (Supplier)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scrap Deduction</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adjusted Cost</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {productsForSupplier.length > 0 ? productsForSupplier.map(product => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.internalSku}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.supplierSku}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(product.invoicePrice)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500">-{formatCurrency(product.supplierType === 'Local/Import' ? SCRAP_VALUES[product.scrapType] : 0)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold">{formatCurrency(getAdjustedCost(product))}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => handleEditProduct(product)} variant="ghost"><Pencil size={16}/></Button>
                    <Button onClick={() => onProductDelete(product.id)} variant="ghost" className="text-red-500 hover:text-red-700"><Trash2 size={16}/></Button>
                  </div>
                </td>
              </tr>
            )) : (
                <tr>
                    <td colSpan="6" className="text-center py-10 text-gray-500">No products found for this supplier.</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
      <ProductEditModal 
        isOpen={isProductModalOpen} 
        onClose={() => setIsProductModalOpen(false)} 
        product={editingProduct}
        suppliers={suppliers}
        onSave={handleSaveProduct}
      />
      <SupplierEditModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        supplier={editingSupplier}
        onSave={handleSaveSupplier}
        onDelete={onSupplierDelete}
        isDeletable={editingSupplier ? !supplierProducts.some(p => p.supplierId === editingSupplier.id) : false}
      />
    </Card>
  );
};

const GpAnalysis = ({ houseBrandPrice, sku, supplierProducts, suppliers }) => {
    const localSuppliers = suppliers.filter(s => !ANCHOR_BRANDS.includes(s.name));
    
    const analysis = localSuppliers.map(supplier => {
        const productFromSupplier = supplierProducts.find(p => p.internalSku === sku && p.supplierId === supplier.id);
        if (!productFromSupplier) return null;

        const adjustedCost = getAdjustedCost(productFromSupplier);
        const gp = houseBrandPrice > 0 ? ((houseBrandPrice - adjustedCost) / houseBrandPrice) * 100 : 0;
        
        return {
            supplierName: supplier.name,
            gp: gp,
            isProfitable: gp > 0,
        };
    }).filter(Boolean);

    if (analysis.length === 0) {
        return <span className="text-xs text-gray-400 italic">No local suppliers for GP analysis.</span>;
    }

    return (
        <div className="flex flex-wrap gap-2 items-center">
            {analysis.map(({ supplierName, gp, isProfitable }) => (
                <div key={supplierName} 
                     className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${isProfitable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span>{supplierName}:</span>
                    <span className="font-bold">{gp.toFixed(1)}% GP</span>
                </div>
            ))}
        </div>
    );
};


const PricingMatrixView = ({ supplierProducts, suppliers, pricingState, onGpConfigChange, activeBranch }) => {
    const [editingBTier, setEditingBTier] = useState(null); // Holds SKU of B-Tier being edited
    const [bTierValue, setBTierValue] = useState(10);

    const handleExportCsv = () => {
      const headers = [
        'SKU', 
        'Brand', 
        'Baseline Cost',
        'G-Tier Price', 'G-Tier GP (%)',
        'B-Tier Price', 'B-Tier GP (%)',
        'S-Tier Price', 'S-Tier GP (%)',
        'A-Tier Price', 'A-Tier GP (%)'
      ];
      
      const rows = [];
      if (pricingState && pricingState[activeBranch]) {
        Object.keys(pricingState[activeBranch]).sort().forEach(sku => {
          const state = pricingState[activeBranch][sku];
          if (!state || !state.anchor.baselineCost) return;
  
          // Anchor Brand Row
          const anchorState = state.anchor;
          rows.push([
            sku,
            'Exide/Willard',
            anchorState.baselineCost.toFixed(2),
            anchorState.g.sellPrice.toFixed(2), anchorState.g.actualGp.toFixed(2),
            anchorState.b.sellPrice.toFixed(2), anchorState.b.actualGp.toFixed(2),
            anchorState.s.sellPrice.toFixed(2), anchorState.s.actualGp.toFixed(2),
            anchorState.a.sellPrice.toFixed(2), anchorState.a.actualGp.toFixed(2)
          ].join(','));
  
          // House Brand Rows
          if (state.hasLocalSource) {
            const cheapestLocalProduct = supplierProducts
              .filter(p => p.internalSku === sku && p.supplierType === 'Local/Import')
              .sort((a, b) => getAdjustedCost(a) - getAdjustedCost(b))[0];

            const houseBrandGp = (price) => {
              if (!cheapestLocalProduct || !price) return '';
              const cost = getAdjustedCost(cheapestLocalProduct);
              return price > 0 ? (((price - cost) / price) * 100).toFixed(2) : '0.00';
            };

            HOUSE_BRANDS.forEach(brand => {
              const brandState = state.house[brand];
              if (!brandState) return;
  
              rows.push([
                sku,
                brand,
                cheapestLocalProduct ? getAdjustedCost(cheapestLocalProduct).toFixed(2) : 'N/A',
                brandState.g.sellPrice.toFixed(2), houseBrandGp(brandState.g.sellPrice),
                brandState.b.sellPrice.toFixed(2), houseBrandGp(brandState.b.sellPrice),
                brandState.s.sellPrice.toFixed(2), houseBrandGp(brandState.s.sellPrice),
                brandState.a.sellPrice.toFixed(2), houseBrandGp(brandState.a.sellPrice)
              ].join(','));
            });
          }
        });
      }
  
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = `Pricing_Matrix_${activeBranch.replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const handleEditBTier = (sku, currentValue) => {
        setEditingBTier(sku);
        setBTierValue(currentValue);
    };

    const handleSaveBTier = (sku) => {
        onGpConfigChange(activeBranch, sku, 'b_mode', 'manual');
        onGpConfigChange(activeBranch, sku, 'b_value', bTierValue);
        setEditingBTier(null);
    };

    const handleResetBTier = (sku) => {
        onGpConfigChange(activeBranch, sku, 'b_mode', 'auto');
        onGpConfigChange(activeBranch, sku, 'b_value', 10);
        setEditingBTier(null);
    };

    return (
        <Card>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Pricing Matrix for <span className="text-blue-600">{activeBranch}</span></h2>
              <Button onClick={handleExportCsv} variant="secondary"> <Download size={16} /> Export CSV </Button>
            </div>
            
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU / Brand</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Baseline Cost</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">G-Tier (Large)</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">B-Tier (Good)</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S-Tier (Counter)</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">A-Tier (Ad)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {pricingState && pricingState[activeBranch] && Object.keys(pricingState[activeBranch]).sort().map(sku => {
                            const state = pricingState[activeBranch][sku];
                            if (!state || !state.anchor.baselineCost) return null;

                            const anchorState = state.anchor;
                            const gpConfig = state.gpConfig;

                            return (
                                <React.Fragment key={sku}>
                                    <tr className="bg-blue-50 border-t-4 border-b-2 border-blue-200">
                                        <td className="px-4 py-3 font-bold text-blue-800">{sku} <br /> <span className="text-xs font-normal">(Exide/Willard)</span></td>
                                        <td className="px-4 py-3 font-semibold text-gray-700">{formatCurrency(anchorState.baselineCost)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <input type="number" value={gpConfig.g * 100} onChange={e => onGpConfigChange(activeBranch, sku, 'g', parseFloat(e.target.value) / 100)} className="w-20 p-1 border rounded" />
                                                <Percent size={14} className="text-gray-500" />
                                            </div>
                                            <div className="text-sm font-bold">{formatCurrency(anchorState.g.sellPrice)}</div>
                                            <div className="text-xs text-green-600">{anchorState.g.actualGp.toFixed(1)}% GP</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {editingBTier === sku ? (
                                                <div className="flex items-center gap-1">
                                                    <input type="number" value={bTierValue} onChange={e => setBTierValue(parseFloat(e.target.value))} className="w-20 p-1 border rounded" />
                                                    <Button onClick={() => handleSaveBTier(sku)} variant="ghost" className="p-1 h-auto"><Check size={16} className="text-green-600"/></Button>
                                                    <Button onClick={() => handleResetBTier(sku)} variant="ghost" className="p-1 h-auto"><RotateCcw size={16} className="text-gray-500"/></Button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className="text-sm font-bold">{formatCurrency(anchorState.b.sellPrice)}</div>
                                                    <Button onClick={() => handleEditBTier(sku, gpConfig.b_value)} variant="ghost" className="p-1 h-auto"><Pencil size={12}/></Button>
                                                </div>
                                            )}
                                            <div className="text-xs text-green-600">{anchorState.b.actualGp.toFixed(1)}% GP</div>
                                            <div className="text-xs text-gray-500">{gpConfig.b_mode === 'auto' ? `(Auto: G + ${gpConfig.b_value}%)` : `(Manual: G + ${gpConfig.b_value}%)`}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <input type="number" value={gpConfig.s * 100} onChange={e => onGpConfigChange(activeBranch, sku, 's', parseFloat(e.target.value) / 100)} className="w-20 p-1 border rounded" />
                                                <Percent size={14} className="text-gray-500" />
                                            </div>
                                            <div className="text-sm font-bold">{formatCurrency(anchorState.s.sellPrice)}</div>
                                            <div className="text-xs text-green-600">{anchorState.s.actualGp.toFixed(1)}% GP</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-bold">{formatCurrency(anchorState.a.sellPrice)}</div>
                                            <div className="text-xs text-green-600">{anchorState.a.actualGp.toFixed(1)}% GP</div>
                                            <div className="text-xs text-gray-500">(Avg B &amp; S)</div>
                                        </td>
                                    </tr>
                                    {state.hasLocalSource ? HOUSE_BRANDS.map(brand => {
                                        const brandState = state.house[brand];
                                        if (!brandState) return null;
                                        return (
                                            <tr key={brand} className="border-b">
                                                <td className="px-4 py-3 pl-8 text-sm text-gray-800">{brand}</td>
                                                <td className="px-4 py-3 text-sm text-gray-500 italic">
                                                    <GpAnalysis houseBrandPrice={brandState.g.sellPrice} sku={sku} supplierProducts={supplierProducts} suppliers={suppliers} />
                                                </td>
                                                <td className="px-4 py-3 text-sm">{formatCurrency(brandState.g.sellPrice)}</td>
                                                <td className="px-4 py-3 text-sm">{formatCurrency(brandState.b.sellPrice)}</td>
                                                <td className="px-4 py-3 text-sm">{formatCurrency(brandState.s.sellPrice)}</td>
                                                <td className="px-4 py-3 text-sm">{formatCurrency(brandState.a.sellPrice)}</td>
                                            </tr>
                                        )
                                    }) : (
                                        <tr className="border-b">
                                            <td colSpan={6} className="px-4 py-2 text-center text-sm text-gray-500 italic bg-gray-50">
                                                House Brand pricing not available (No Local/Import source product for this SKU)
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};


const CustomerPriceListView = ({ pricingState, activeBranch }) => {
    const [activeTier, setActiveTier] = useState('s');
    const [rounding, setRounding] = useState(50);
    const [showVat, setShowVat] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const priceListRef = useRef(null);

    const TIER_NAMES = {
        g: "G - Large Customers",
        b: "B - Good Customers",
        s: "S - Counter Prices",
        a: "A - Advertising Prices"
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPdf = () => {
        const input = priceListRef.current;
        html2canvas(input, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;
            const width = pdfWidth - 20; // with margin
            const height = width / ratio;
            pdf.addImage(imgData, 'PNG', 10, 10, width, height);
            pdf.save(`GBSA_Price_List_${TIER_NAMES[activeTier].replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
        });
    };

    const handleExportCsv = () => {
        const headers = ['SKU', ...ALL_BRANDS];

        const rows = filteredSkus.map(sku => {
            const rowData = [sku];
            ALL_BRANDS.forEach(brand => {
                const price = getDisplayPrice(sku, brand);
                rowData.push(price !== null ? price.toFixed(2) : '');
            });
            return rowData.join(',');
        });

        const csvContent = [
            headers.join(','),
            ...rows
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const fileName = `GBSA_Price_List_${TIER_NAMES[activeTier].replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    
    const currentPriceData = pricingState ? pricingState[activeBranch] : {};

    const filteredSkus = useMemo(() => {
        if (!currentPriceData) return [];
        return Object.keys(currentPriceData).filter(sku => {
            const state = currentPriceData[sku];
            if (!state || !state.anchor.baselineCost) return false;
            return sku.toLowerCase().includes(searchTerm.toLowerCase()) || 
                   ALL_BRANDS.some(brand => brand.toLowerCase().includes(searchTerm.toLowerCase()))
        }).sort();
    }, [currentPriceData, searchTerm]);

    const getDisplayPrice = (sku, brand) => {
        const state = currentPriceData ? currentPriceData[sku] : null;
        if (!state) return null;
        
        const isAnchor = ANCHOR_BRANDS.includes(brand);
        const priceData = isAnchor ? state.anchor : state.house[brand];

        if (!priceData || (isAnchor && !state.anchor.baselineCost) || (!isAnchor && !state.hasLocalSource)) {
            return null;
        }

        if (!priceData[activeTier]) return null;
        
        const basePriceExclVat = priceData[activeTier].sellPrice;
        if (typeof basePriceExclVat !== 'number') return null;

        const priceInclVat = basePriceExclVat * (1 + VAT_RATE);
        const roundedPrice = roundToNearest(priceInclVat, rounding);

        return showVat ? roundedPrice : roundedPrice / (1 + VAT_RATE);
    };

    return (
        <Card>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6 no-print">
                <h2 className="text-2xl font-bold text-gray-900">Customer Price List</h2>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handlePrint} variant="secondary"><Printer size={16}/> Print</Button>
                    <Button onClick={handleDownloadPdf} variant="secondary"><Download size={16}/> Download PDF</Button>
                    <Button onClick={handleExportCsv} variant="secondary"><Download size={16}/> Export CSV</Button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg no-print">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price Tier</label>
                    <select value={activeTier} onChange={e => setActiveTier(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md shadow-sm">
                        <option value="g">{TIER_NAMES.g}</option>
                        <option value="b">{TIER_NAMES.b}</option>
                        <option value="s">{TIER_NAMES.s}</option>
                        <option value="a">{TIER_NAMES.a}</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rounding</label>
                     <select value={rounding} onChange={e => setRounding(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-md shadow-sm">
                        <option value="0">No Rounding</option>
                        <option value="50">Nearest R50</option>
                        <option value="100">Nearest R100</option>
                    </select>
                </div>
                <div className="flex items-end pb-1">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <span className="text-sm font-medium text-gray-700">Show Price Incl. VAT</span>
                        <div className="relative">
                            <input type="checkbox" checked={showVat} onChange={() => setShowVat(!showVat)} className="sr-only peer" />
                            <div className="block w-14 h-8 rounded-full bg-gray-300 peer-checked:bg-blue-600 transition"></div>
                            <div className="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform peer-checked:translate-x-6"></div>
                        </div>
                    </label>
                </div>
            </div>

            <div className="mb-4 relative no-print">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="text"
                    placeholder="Search by SKU or Brand..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full p-2 pl-10 border border-gray-300 rounded-md shadow-sm"
                />
            </div>

            <div ref={priceListRef} className="printable-area">
                <div className="text-center mb-4 printable-header">
                    <h3 className="text-xl font-bold text-gray-800">GBSA Price List - {TIER_NAMES[activeTier]}</h3>
                    <p className="text-sm text-gray-600">
                        {new Date().toLocaleString('en-ZA', { month: 'long', year: 'numeric' })} - {activeBranch}
                    </p>
                </div>
                <table className="min-w-full divide-y divide-gray-200 border">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b">SKU</th>
                            {ALL_BRANDS.map(brand => (
                                <th key={brand} className="px-4 py-2 text-right text-xs font-bold text-gray-600 uppercase tracking-wider border-b">{brand}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredSkus.map(sku => (
                            <tr key={sku} className="hover:bg-gray-50">
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{sku}</td>
                                {ALL_BRANDS.map(brand => (
                                    <td key={brand} className="px-4 py-2 whitespace-nowrap text-right text-sm font-semibold text-gray-800">
                                        {formatCurrency(getDisplayPrice(sku, brand))}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

// --- MAIN APP COMPONENT (/app/page.tsx) ---

export default function App() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeView, setActiveView] = useState('matrix');
  const [activeBranch, setActiveBranch] = useState(BRANCHES[0]);
  const [suppliers, setSuppliers] = useState(INITIAL_SUPPLIERS);
  const [supplierProducts, setSupplierProducts] = useState(INITIAL_SUPPLIER_PRODUCTS);
  
  const [gpInputs, setGpInputs] = useState(() => {
    const initialState = {};
    const allSkus = [...new Set([...INITIAL_SUPPLIER_PRODUCTS.map(p => p.internalSku), ...INTERNAL_SKU_CATEGORIES])];
    BRANCHES.forEach(branch => {
        initialState[branch] = {};
        allSkus.forEach(sku => {
            initialState[branch][sku] = { g: 0.15, s: 0.40, b_mode: 'auto', b_value: 10 };
        });
    });
    return initialState;
  });
  const fileInputRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleExportData = () => {
    const dataToExport = {
        suppliers,
        supplierProducts,
        gpInputs,
    };
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `gbsa_pricing_data_${new Date().toISOString().slice(0, 10)}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData.suppliers && importedData.supplierProducts && importedData.gpInputs) {
                    setSuppliers(importedData.suppliers);
                    setSupplierProducts(importedData.supplierProducts);
                    setGpInputs(importedData.gpInputs);
                    alert('Data imported successfully!');
                } else {
                    alert('Invalid data file format.');
                }
            } catch (error) {
                alert('Error reading or parsing the file.');
                console.error("Import error:", error);
            }
        };
        reader.readAsText(file);
    }
  };

  const triggerImport = () => {
    fileInputRef.current.click();
  };

  const handleGpConfigChange = (branch, sku, key, value) => {
    setGpInputs(prev => ({
        ...prev,
        [branch]: {
            ...prev[branch],
            [sku]: {
                ...prev[branch][sku],
                [key]: value
            }
        }
    }));
  };

  const handleProductUpdate = (updatedProduct) => {
    setSupplierProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };
  
  const handleProductAdd = (newProduct) => {
    setSupplierProducts(prev => [...prev, newProduct]);
    if (!gpInputs[BRANCHES[0]][newProduct.internalSku]) {
        setGpInputs(prev => {
            const newGps = {...prev};
            BRANCHES.forEach(branch => {
                newGps[branch][newProduct.internalSku] = { g: 0.15, s: 0.40, b_mode: 'auto', b_value: 10 };
            });
            return newGps;
        });
    }
  };
  
  const handleProductDelete = (productId) => {
    setSupplierProducts(prev => prev.filter(p => p.id !== productId));
  };

  const handleSupplierAdd = (newSupplier) => {
    setSuppliers(prev => [...prev, newSupplier]);
  };

  const handleSupplierUpdate = (updatedSupplier) => {
    setSuppliers(prev => prev.map(s => s.id === updatedSupplier.id ? updatedSupplier : s));
  };

  const handleSupplierDelete = (supplierId) => {
    setSuppliers(prev => prev.filter(s => s.id !== supplierId));
  };

  const pricingState = useMemo(() => {
    const newState = {};
    const allSkus = [...new Set([...supplierProducts.map(p => p.internalSku), ...INTERNAL_SKU_CATEGORIES])];

    BRANCHES.forEach(branch => {
        newState[branch] = {};
        allSkus.forEach(sku => {
            const productsForSku = supplierProducts.filter(p => p.internalSku === sku);
            if (productsForSku.length === 0) return;

            const anchorProducts = productsForSku.filter(p => {
                const supplier = suppliers.find(s => s.id === p.supplierId);
                return supplier && ANCHOR_BRANDS.includes(supplier.name);
            });
            
            const anchorCosts = anchorProducts.map(p => p.invoicePrice);
            const baselineCost = anchorCosts.length > 0 ? anchorCosts.reduce((a, b) => a + b, 0) / anchorCosts.length : 0;
            
            const hasLocalSource = productsForSku.some(p => p.supplierType === 'Local/Import');
            const gpConfig = gpInputs[branch]?.[sku] || { g: 0.15, s: 0.40, b_mode: 'auto', b_value: 10 };
            
            newState[branch][sku] = { anchor: {}, house: {}, hasLocalSource, gpConfig };

            if (baselineCost > 0) {
                const gSellPrice = baselineCost / (1 - gpConfig.g);
                const sSellPrice = baselineCost / (1 - gpConfig.s);
                
                let bSellPrice;
                if(gpConfig.b_mode === 'manual'){
                    bSellPrice = gSellPrice * (1 + (gpConfig.b_value / 100));
                } else {
                    bSellPrice = gSellPrice * 1.10; // Default auto
                }
                
                const aSellPrice = (bSellPrice + sSellPrice) / 2;

                const calculateActualGp = (price) => price > 0 ? ((price - baselineCost) / price) * 100 : 0;

                newState[branch][sku].anchor = {
                    baselineCost,
                    g: { sellPrice: gSellPrice, actualGp: calculateActualGp(gSellPrice) },
                    b: { sellPrice: bSellPrice, actualGp: calculateActualGp(bSellPrice) },
                    s: { sellPrice: sSellPrice, actualGp: calculateActualGp(sSellPrice) },
                    a: { sellPrice: aSellPrice, actualGp: calculateActualGp(aSellPrice) },
                };

                if (hasLocalSource) {
                    const anchorPrices = newState[branch][sku].anchor;
                    const housePrices = {};
                    housePrices['Global 12'] = {
                        g: { sellPrice: anchorPrices.g.sellPrice * 0.80 }, b: { sellPrice: anchorPrices.b.sellPrice * 0.80 },
                        s: { sellPrice: anchorPrices.s.sellPrice * 0.80 }, a: { sellPrice: anchorPrices.a.sellPrice * 0.80 },
                    };
                    housePrices['Novax Premium'] = {
                        g: { sellPrice: anchorPrices.g.sellPrice * 0.90 }, b: { sellPrice: anchorPrices.b.sellPrice * 0.90 },
                        s: { sellPrice: anchorPrices.s.sellPrice * 0.90 }, a: { sellPrice: anchorPrices.a.sellPrice * 0.90 },
                    };
                    housePrices['Novax 18'] = {
                        g: { sellPrice: (housePrices['Global 12'].g.sellPrice + housePrices['Novax Premium'].g.sellPrice) / 2 },
                        b: { sellPrice: (housePrices['Global 12'].b.sellPrice + housePrices['Novax Premium'].b.sellPrice) / 2 },
                        s: { sellPrice: (housePrices['Global 12'].s.sellPrice + housePrices['Novax Premium'].s.sellPrice) / 2 },
                        a: { sellPrice: (housePrices['Global 12'].a.sellPrice + housePrices['Novax Premium'].a.sellPrice) / 2 },
                    };
                    newState[branch][sku].house = housePrices;
                }
            } else {
                 newState[branch][sku].anchor = { baselineCost: 0, g:{}, b:{}, s:{}, a:{} };
            }
        });
    });

    return newState;
  }, [supplierProducts, gpInputs, suppliers]);

  const renderActiveView = () => {
    switch (activeView) {
      case 'costs':
        return <SupplierCostView 
                    suppliers={suppliers} 
                    supplierProducts={supplierProducts} 
                    onProductUpdate={handleProductUpdate}
                    onProductAdd={handleProductAdd}
                    onProductDelete={handleProductDelete}
                    onSupplierAdd={handleSupplierAdd}
                    onSupplierUpdate={handleSupplierUpdate}
                    onSupplierDelete={handleSupplierDelete}
                />;
      case 'matrix':
        return <PricingMatrixView 
                    supplierProducts={supplierProducts} 
                    suppliers={suppliers}
                    pricingState={pricingState} 
                    onGpConfigChange={handleGpConfigChange}
                    activeBranch={activeBranch}
                />;
      case 'pricelist':
        return <CustomerPriceListView 
                    pricingState={pricingState}
                    activeBranch={activeBranch}
                />;
      default:
        return null;
    }
  };

  if (!isMounted) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-area, .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none;
          }
        }
      `}</style>
      <div className="bg-gray-100 min-h-screen font-sans">
        <header className="bg-white shadow-sm no-print">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold text-gray-900">
                        GBSA Pricing
                    </h1>
                    <div>
                        <label htmlFor="branch-select" className="sr-only">Select Branch</label>
                        <select 
                            id="branch-select"
                            value={activeBranch}
                            onChange={e => setActiveBranch(e.target.value)}
                            className="p-2 border border-gray-300 rounded-md shadow-sm font-semibold"
                        >
                            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                      <input type="file" ref={fileInputRef} onChange={handleImportData} className="hidden" accept=".json"/>
                      <Button onClick={triggerImport} variant="secondary"><Upload size={16}/> Import</Button>
                      <Button onClick={handleExportData} variant="secondary"><Download size={16}/> Export</Button>
                  </div>
              </div>
          </div>
        </header>
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 no-print">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button onClick={() => setActiveView('costs')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeView === 'costs' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                  Supplier Costs
                </button>
                <button onClick={() => setActiveView('matrix')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeView === 'matrix' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                  Pricing Matrix
                </button>
                <button onClick={() => setActiveView('pricelist')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeView === 'pricelist' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                  Customer Price List
                </button>
              </nav>
            </div>
          </div>

          {renderActiveView()}
        </main>
      </div>
    </>
  );
}