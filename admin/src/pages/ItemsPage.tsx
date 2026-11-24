import { useEffect, useState } from 'react'
import { createItem, deleteItem, fetchItems, updateItem, AdminItem } from '../api'

// Category values are Chinese: they are data values shared with the server and mini-program
const CATEGORIES = ['上衣', '裤子']

// Display helper: show a bilingual label while keeping the Chinese data value
const categoryLabel = (c: string) => (c === '上衣' ? 'Tops' : 'Bottoms')

export default function ItemsPage() {
  const [items, setItems] = useState<AdminItem[]>([])
  const [error, setError] = useState('')
  const [tip, setTip] = useState('')

  // Create form
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('上衣')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Edit state (the item id being edited and its draft)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('上衣')
  const [editFile, setEditFile] = useState<File | null>(null)

  const load = async () => {
    try {
      setItems(await fetchItems())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const flash = (msg: string) => {
    setTip(msg)
    setTimeout(() => setTip(''), 2000)
  }

  const handleAdd = async () => {
    if (!title.trim()) return setError('Item title is required')
    if (!file) return setError('Please select an item image')
    setSubmitting(true)
    setError('')
    try {
      await createItem({ title, category, file })
      setTitle('')
      setFile(null)
      setPreview('')
      await load()
      flash('Added successfully')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (item: AdminItem) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditCategory(item.category)
    setEditFile(null)
  }

  const handleUpdate = async () => {
    if (!editingId) return
    setSubmitting(true)
    setError('')
    try {
      await updateItem(editingId, {
        title: editTitle,
        category: editCategory,
        file: editFile,
      })
      setEditingId(null)
      await load()
      flash('Updated successfully')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (item: AdminItem) => {
    if (!window.confirm(`Delete "${item.title}"? Its try-on records will also be removed`)) return
    try {
      await deleteItem(item.id)
      await load()
      flash('Deleted')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div>
      <section className='card'>
        <h3>Add Item</h3>
        <div className='form-row'>
          <input
            className='input'
            placeholder='Item title, e.g. Light Blue Graphic T-Shirt'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className='input select'
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <input
            className='input'
            type='file'
            accept='image/*'
            onChange={(e) => {
              const f = e.target.files?.[0] || null
              setFile(f)
              setPreview(f ? URL.createObjectURL(f) : '')
            }}
          />
          {preview && <img className='thumb' src={preview} alt='preview' />}
          <button className='btn btn-primary' disabled={submitting} onClick={handleAdd}>
            {submitting ? 'Submitting...' : 'Add'}
          </button>
        </div>
      </section>

      {error && <div className='error banner'>{error}</div>}
      {tip && <div className='tip banner'>{tip}</div>}

      <section className='card'>
        <h3>Items ({items.length})</h3>
        <table className='table'>
          <thead>
            <tr>
              <th>Image</th>
              <th>Title</th>
              <th>Category</th>
              <th>New</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              editingId === item.id ? (
                <tr key={item.id}>
                  <td data-label='Image'>
                    <img className='thumb' src={editFile ? URL.createObjectURL(editFile) : item.image} alt='' />
                    <input
                      type='file'
                      accept='image/*'
                      onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                    />
                  </td>
                  <td data-label='Title'>
                    <input
                      className='input'
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </td>
                  <td data-label='Category'>
                    <select
                      className='input select'
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label='New'>—</td>
                  <td data-label='Created'>{item.createdAt.slice(0, 10)}</td>
                  <td className='td-actions' data-label=''>
                    <button className='btn btn-primary' disabled={submitting} onClick={handleUpdate}>
                      Save
                    </button>
                    <button className='btn' onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={item.id}>
                  <td className='td-img' data-label=''>
                    <img className='thumb' src={item.image} alt={item.title} />
                  </td>
                  <td className='td-title' data-label=''>
                    {item.title}
                  </td>
                  <td data-label='Category'>{categoryLabel(item.category)}</td>
                  <td data-label='New'>
                    {item.isNew ? <span className='badge-new'>New</span> : <span className='badge-old'>—</span>}
                  </td>
                  <td data-label='Created'>{item.createdAt.slice(0, 10)}</td>
                  <td className='td-actions' data-label=''>
                    <button className='btn' onClick={() => startEdit(item)}>
                      Edit
                    </button>
                    <button className='btn btn-danger' onClick={() => handleDelete(item)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <p className='hint'>Note: "New" is determined automatically by the server based on the item's creation time — items created within 30 days count as new and expire automatically afterwards.</p>
      </section>
    </div>
  )
}
