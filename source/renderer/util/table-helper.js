/* global $ */
/**
* @ignore
* BEGIN HEADER
*
* Contains:        TableHelper class
* CVM-Role:        <none>
* Maintainer:      Hendrik Erz
* License:         GNU GPL v3
*
* Description:     This class is a powerful helper class able to work with
*                  Markdown tables. It is able to modify them using a real
*                  contenteditable table that can be converted to Markdown
*                  on the fly and also be created from Markdown.
*
* END HEADER
*/

class TableHelper {
  /**
   * Creates a new TableHelper. You can pass rows and cols, if you wish. If you
   * want to create the Table from a Markdown string, you could leave them at
   * zero, as they will be recalculated anyway after you've parsed the markdown
   * table.
   * @param {number} rows           The number of rows
   * @param {number} cols           The number of columns
   * @param {Object} [options=null] An object with optional callbacks for onBlur and onChange.
   */
  constructor (rows, cols, options = null) {
    // Set up the class
    this._rows = rows
    this._cols = cols
    this._cellIndex = 0
    this._rowIndex = 0
    this._options = options
    this._containerElement = options.container || $('body')
    if (typeof this._containerElement === 'string') this._containerElement = $(this._containerElement)

    this._elem = undefined
    this._ast = [] // The Abstract Syntax Tree representing the table contents
    this._colSizes = [] // The maximum number of chars in each column
    this._colAlignment = [] // Holds the column alignment, can be "left" (default), "center" or "right"
    this._edgeButtonsVisible = false // Are the edge buttons visible?
    this._edgeButtonSize = 30 // Size in pixels

    // Generate a valid and unique table ID with which this table can be
    // identified in the DOM tree.
    this._generateTableID()

    // Directly build the respective node, if applicable
    if (this._rows > 0 && this._cols > 0) this._buildDOMElement()

    // Inject the CSS necessary to style the table and buttons.
    this._injectCSS()
  }

  /**
   * Rebuilds the DOM node from scratch.
   * @return {void} Does not return.
   */
  _buildDOMElement () {
    this._elem = $('<table>').attr('id', this._tableID).addClass('table-helper')
    for (let i = 0; i < this._rows; i++) {
      let row = $('<tr>').css('width', '100%')
      this._elem.append(row)
      for (let j = 0; j < this._cols; j++) {
        row.append($('<td></td>').attr('contenteditable', 'true'))
      }
    }
  }

  // Display the edge action buttons when the user hovers over the table
  // This must be activated here, as we need to rely on it being attached
  // only once.
  _moveHelper (evt) {
    // Detach the helper if the element is not rendered
    if (!this._elem) return this._containerElement.off('mousemove', this._moveHelper)
    let minX = this._elem.offset().left - this._edgeButtonSize / 2
    let minY = this._elem.offset().top - this._edgeButtonSize / 2
    let maxX = minX + this._elem.outerWidth() + this._edgeButtonSize // Not half to account for the lower minY
    let maxY = minY + this._elem.outerHeight() + this._edgeButtonSize // Not half to account for the lower minY

    if (evt.clientX >= minX && evt.clientX <= maxX && evt.clientY >= minY && evt.clientY <= maxY) {
      this._showEdgeButtons()
    } else {
      this._hideEdgeButtons()
    }
  }

  /**
   * Rebuilds the complete DOM node from the given Abstract Syntax Tree.
   * @param  {Array} ast           A two-dimensional syntax tree
   * @param  {array} colAlignments An array indicating the alignment for all columns.
   * @return {void}               Does not return.
   */
  _rebuildFromAST (ast, colAlignments) {
    if (this._elem) this._elem.detach() // In case the user has added it to the DOM already
    this._elem = $('<table></table>').attr('id', this._tableID).addClass('table-helper')
    for (let i = 0; i < ast.length; i++) {
      let row = $('<tr></tr>').css('width', '100%')
      this._elem.append(row)
      for (let j = 0; j < ast[i].length; j++) {
        // Preset the colSizes
        if (!this._colSizes[j]) this._colSizes[j] = ast[i][j].length
        if (ast[i][j].length > this._colSizes[j]) this._colSizes[j] = ast[i][j].length
        row.append($('<td></td>').text(ast[i][j]).css('text-align', colAlignments[j]).attr('contenteditable', 'true'))
      }
    }

    // Save the colAlignment settings
    this._colAlignment = colAlignments
    // Also, save the corresponding AST
    this._ast = ast
  }

  /**
   * Returns the corresponding DOM node.
   * @return {DOMNode} The table's DOM node.
   */
  getDOMElement () { return this._elem[0] }

  /**
  * Returns the table's ID (useful for querying if the DOM element has already
  * been rendered, if you're deferring the rendering to an external plugin.)
  * @return {string} The ID assigned to the table element.
  */
  getTableID () { return this._tableID }

  /**
   * Generates a unique table ID for this table.
   * @return {void} Does not return.
   */
  _generateTableID () {
    do {
      this._tableID = 'table' + Math.floor(Math.random() * 50) + `${Date.now()}`
    } while (document.getElementById(this._tableID))
  }

  /**
   * Rebuilds the full AST and the DOM element from the given Markdown table.
   * Throws errors if it encounters any errors while parsing.
   * @param  {string|array} markdownTable The Markdown table, either as string or line array.
   * @return {void}               Does not return.
   */
  fromMarkdown (markdownTable) {
    // This function re-builds the full table from a given Markdown table.
    if (!Array.isArray(markdownTable)) markdownTable = markdownTable.split('\n')

    if (markdownTable.length === 0) throw new Error('MarkdownTable was empty!')
    if (markdownTable.length === 1 && markdownTable[0].trim() === '') throw new Error('MarkdownTable was empty!')

    let ast = [] // Two-dimensional array
    let colAlignments = [] // One-dimensional column alignments
    let numColumns // If there is an uneven number of columns, throw an error.
    // Now iterate over all table rows
    for (let i = 0; i < markdownTable.length; i++) {
      // Ignore empty lines
      if (markdownTable[i].trim() === '') continue
      let row = markdownTable[i]

      // Remove surrounding pipes
      if (row[0] === '|') row = row.substr(1)
      if (row[row.length - 1] === '|') row = row.substr(0, row.length - 1)

      // Split to columns
      row = row.split('|')

      // First row determines the amount of columns expected
      if (!numColumns) numColumns = row.length
      if (numColumns !== row.length) throw new Error('Malformed Markdown Table!')

      // First test if we've got a header row.
      // A header row is defined of consisting of columns only containing
      // dashes and colons. The first column to break this rule means we
      // don't have a valid header.
      let isHeader = true
      for (let col of row) {
        if (!/^[-:]+$/.test(col)) {
          isHeader = false
          break
        }
      }

      if (isHeader) {
        for (let j = 0; j < row.length; j++) {
          let col = row[j].trim()
          if (col[0] === ':' && col[col.length - 1] === ':') {
            colAlignments[j] = 'center'
          } else if (col[col.length - 1] === ':') {
            colAlignments[j] = 'right'
          } else {
            colAlignments[j] = 'left'
          }
        }
        continue // We're done here -- don't add it to the AST
      }

      // Now parse all columns
      let cols = []
      for (let j = 0; j < row.length; j++) {
        cols.push(row[j].trim()) // Trim whitespaces
      }

      // Add the whole row to the AST
      ast.push(cols)
    }

    // If we have reached this stage, but no header row was found,
    // preset all column alignments with left
    if (colAlignments.length === 0) {
      for (let i = 0; i < numColumns; i++) {
        colAlignments.push('left')
      }
    }

    // Now we need to rebuild everything from the AST
    this._rebuildFromAST(ast, colAlignments)
  }

  /**
   * Initiates the event listeners for this table. Must be called after the
   * DOM object has been added to the DOM tree.
   * @return {void} Does not return.
   */
  initiate () {
    // Activate the keyboard navigation. What's possible:
    // Arrow up/down: Move to previous/next row (same column)
    // Arrow left/right: Move to previous/next column, if
    // the caret is at the beginning/end of the text content
    // Return: Move to next row, same column. Append rows,
    // if necessary.
    // Tab: Move to the next column, to the next row, if
    // necessary. Appends new rows, if necessary.
    // Shift-Tab: Move to the previous column, to the
    // previous row, if applicable.
    $('table#' + this._tableID).off('keydown', 'td').on('keydown', 'td', (evt) => {
      // Recalculate the cell index, just for sure.
      this._recalculateCurrentCell($(evt.target))
      // Also recalculate the button positions as the table's size may have changed.
      this._recalculateEdgeButtonPositions()

      if ([37, 38, 39, 40].includes(evt.which)) {
        let cursorPosition = this._getCursorPositionInElement(evt.target)
        let isAtEnd = cursorPosition === evt.target.textContent.length
        let isAtBegin = cursorPosition === 0

        switch (evt.which) {
          case 37: // Arrow Left
            // Move to previous cell if isAtBegin
            if (isAtBegin) this.previousCell()
            break
          case 38: // Arrow Up
            // Move to previous row
            this.previousRow()
            break
          case 39: // Arrow Right
            // Move to next cell if isAtEnd (without adding new rows)
            if (isAtEnd) this.nextCell(false)
            break
          case 40: // Arrow Down
            // Move to next row (without adding new rows)
            this.nextRow(false)
            break
        }
      }

      if (evt.which === 13) { // Return
        evt.preventDefault()
        this.nextRow()
        // In this case, also select the full text content
        // this._selectElementContents(evt.target)
      } else if (evt.which === 9) { // Tab
        evt.preventDefault();
        // Move to next column, or to previous if shift was pressed.
        (evt.shiftKey) ? this.previousCell() : this.nextCell()
      }
    })

    $('table#' + this._tableID).off('keyup', 'td').on('keyup', 'td', (evt) => {
      // After everything is done, and potentially new rows, cols and content has been
      // added, we need to notify some third actor that the table has been changed.
      // Why do this on a separate, keyup event? To include the last pressed character.
      // Navigation must be handled on keydown, NOT on keyup, but the last "normal" char
      // inserted in the table will only be recognised on keyUp.
      this._signalContentChange()
    })

    $('table#' + this._tableID).off('focus', 'td').on('focus', 'td', (evt) => {
      // As soon as any cell is focused, recalculate
      // the current cell and table dimensions.
      this._recalculateCurrentCell($(evt.target))
    })

    $('table#' + this._tableID).off('blur', 'td').on('blur', 'td', (evt) => {
      if (!this._elem.is(':focus-within')) {
        // If we are here, the full table has lost focus.
        // It's a good idea to update any content now!
        if (this._options.hasOwnProperty('onBlur')) this._options.onBlur(this)
      }
    })

    // Finally instantiate the move helper
    this._containerElement.on('mousemove', $.proxy(this._moveHelper, this))
  }

  /**
   * Displays the edge buttons for adding rows, columns, alignment and removal.
   * @return {void} Does not return.
   */
  _showEdgeButtons () {
    if (this._edgeButtonsVisible) return
    // We need to show four edge buttons
    let template = $('<div>').addClass('table-helper-add-button')

    // We also need the alignment buttons
    this._alignButtons = $('<div></div>').addClass('table-helper-align-button-container')
    this._alignButtons.attr('id', 'table_' + this._tableID + '_alignButtons')
    let alignButtonsTpl = $('<div></div>').addClass('table-helper-align-button')
    // Add the three lines to each alignButton
    alignButtonsTpl.append($('<div>').addClass('table-helper-align-button-line'))
    alignButtonsTpl.append($('<div>').addClass('table-helper-align-button-line'))
    alignButtonsTpl.append($('<div>').addClass('table-helper-align-button-line'))
    this._alignLeftButton = alignButtonsTpl.clone().attr('id', 'table_' + this._tableID + '_alignLeft').addClass('align-left')
    this._alignCenterButton = alignButtonsTpl.clone().attr('id', 'table_' + this._tableID + '_alignCenter').addClass('align-center')
    this._alignRightButton = alignButtonsTpl.clone().attr('id', 'table_' + this._tableID + '_alignRight').addClass('align-right')
    this._alignButtons.append(this._alignLeftButton).append(this._alignCenterButton).append(this._alignRightButton)

    // Also we need the remove row & col buttons
    this._removeButtons = $('<div></div>').addClass('table-helper-remove-button-container')
    this._removeButtons.attr('id', 'table_' + this._tableID + '_removeButtons')
    let removeButtonsTpl = $('<div></div<').addClass('table-helper-remove-button')
    removeButtonsTpl.append($('<div>').addClass('table-helper-remove-button-line'))
    removeButtonsTpl.append($('<div>').addClass('table-helper-remove-button-line'))
    removeButtonsTpl.append($('<div>').addClass('table-helper-remove-button-line'))
    this._removeRowButton = removeButtonsTpl.clone().attr('id', 'table_' + this._tableID + '_removeRow').addClass('row')
    this._removeColButton = removeButtonsTpl.clone().attr('id', 'table_' + this._tableID + '_removeCol').addClass('col')
    this._removeButtons.append(this._removeRowButton).append(this._removeColButton)

    // Edge buttons for adding columns and rows.
    this._addTopButton = template.clone().html('+').attr('id', 'table_' + this._tableID + '_addTop')
    this._addBottomButton = template.clone().html('+').attr('id', 'table_' + this._tableID + '_addBottom')
    this._addLeftButton = template.clone().html('+').attr('id', 'table_' + this._tableID + '_addLeft')
    this._addRightButton = template.clone().html('+').attr('id', 'table_' + this._tableID + '_addRight')

    // Attach all buttons to the DOM
    $('body').append(this._addTopButton).append(this._addBottomButton).append(this._addLeftButton).append(this._addRightButton)
    $('body').append(this._alignButtons)
    $('body').append(this._removeButtons)

    this._recalculateEdgeButtonPositions()
    this._edgeButtonsVisible = true
    this._activateEdgeButtons()
  }

  /**
  * Recalculates the correct positions of all edge buttons.
  */
  _recalculateEdgeButtonPositions () {
    // Calculate positions position
    this._addTopButton.css('top', (this._elem.offset().top - this._edgeButtonSize / 2) + 'px').css('left', (this._elem.offset().left + this._elem.outerWidth() / 2 - this._edgeButtonSize / 2) + 'px')
    this._addBottomButton.css('top', (this._elem.offset().top + this._elem.outerHeight() - this._edgeButtonSize / 2) + 'px').css('left', (this._elem.offset().left + this._elem.outerWidth() / 2 - this._edgeButtonSize / 2) + 'px')
    this._addLeftButton.css('top', (this._elem.offset().top + this._elem.outerHeight() / 2 - this._edgeButtonSize / 2) + 'px').css('left', (this._elem.offset().left - this._edgeButtonSize / 2) + 'px')
    this._addRightButton.css('top', (this._elem.offset().top + this._elem.outerHeight() / 2 - this._edgeButtonSize / 2) + 'px').css('left', (this._elem.offset().left + this._elem.outerWidth() - this._edgeButtonSize / 2) + 'px')
    this._alignButtons.css('top', (this._elem.offset().top - this._edgeButtonSize / 2) + 'px').css('left', (this._elem.offset().left + this._edgeButtonSize / 2) + 'px')
    this._removeButtons.css('top', (this._elem.offset().top - this._edgeButtonSize / 2) + 'px').css('left', (this._elem.offset().left + this._elem.outerWidth() - this._edgeButtonSize * 2.5) + 'px')

    // Make sure all buttons stay visible on screen
    if (this._addTopButton.offset().top < 0) this._addTopButton.css('top', this._edgeButtonSize + 'px')
    if (this._addBottomButton.offset().top < 0) this._addBottomButton.css('top', this._edgeButtonSize + 'px')
    if (this._addLeftButton.offset().top < 0) this._addLeftButton.css('top', this._edgeButtonSize + 'px')
    if (this._addRightButton.offset().top < 0) this._addRightButton.css('top', this._edgeButtonSize + 'px')
    if (this._alignButtons.offset().top < 0) this._alignButtons.css('top', this._edgeButtonSize + 'px')
    if (this._removeButtons.offset().top < 0) this._removeButtons.css('top', this._edgeButtonSize + 'px')

    if (this._addTopButton.offset().top > $(window).height()) this._addTopButton.css('top', ($(window).height() - this._edgeButtonSize * 2) + 'px')
    if (this._addBottomButton.offset().top > $(window).height()) this._addBottomButton.css('top', ($(window).height() - this._edgeButtonSize * 2) + 'px')
    if (this._addLeftButton.offset().top > $(window).height()) this._addLeftButton.css('top', ($(window).height() - this._edgeButtonSize * 2) + 'px')
    if (this._addRightButton.offset().top > $(window).height()) this._addRightButton.css('top', ($(window).height() - this._edgeButtonSize * 2) + 'px')
    if (this._alignButtons.offset().top > $(window).height()) this._alignButtons.css('top', ($(window).height() - this._edgeButtonSize * 2) + 'px')
    if (this._removeButtons.offset().top > $(window).height()) this._removeButtons.css('top', ($(window).height() - this._edgeButtonSize * 2) + 'px')
  }

  /**
   * Activates the edge buttons to listen for mouse clicks.
   * @return {void} does not return.
   */
  _activateEdgeButtons () {
    // Activate the edge button's functionality
    // We need to prevent the default on the mousedowns,
    // otherwise the table cell will lose focus, thereby
    // triggering the blur event on the table.
    this._addTopButton.on('mousedown', (e) => {
      e.preventDefault()
      this.prependRow()
      this.selectCell()
    })
    this._addBottomButton.on('mousedown', (e) => {
      e.preventDefault()
      this.appendRow()
      this.selectCell()
    })
    this._addLeftButton.on('mousedown', (e) => {
      e.preventDefault()
      this.prependCol()
      this.selectCell()
    })
    this._addRightButton.on('mousedown', (e) => {
      e.preventDefault()
      this.appendCol()
      this.selectCell()
    })
    this._alignLeftButton.on('mousedown', (e) => {
      e.preventDefault()
      this.changeColAlignment('left')
      this.selectCell()
    })
    this._alignCenterButton.on('mousedown', (e) => {
      e.preventDefault()
      this.changeColAlignment('center')
      this.selectCell()
    })
    this._alignRightButton.on('mousedown', (e) => {
      e.preventDefault()
      this.changeColAlignment('right')
      this.selectCell()
    })

    this._removeRowButton.on('mousedown', (e) => {
      e.preventDefault()
      this.pluckRow()
      this.selectCell()
    })

    this._removeColButton.on('mousedown', (e) => {
      e.preventDefault()
      this.pluckCol()
      this.selectCell()
    })
  }

  /**
   * Removes the edge buttons from the DOM.
   * @return {void} Does not return.
   */
  _hideEdgeButtons () {
    // Hide the edge detection buttons again
    $('#table_' + this._tableID + '_addTop').detach()
    $('#table_' + this._tableID + '_addBottom').detach()
    $('#table_' + this._tableID + '_addLeft').detach()
    $('#table_' + this._tableID + '_addRight').detach()
    $('#table_' + this._tableID + '_alignButtons').detach()
    $('#table_' + this._tableID + '_removeButtons').detach()
    this._edgeButtonsVisible = false
  }

  /**
  *
  * @param {jQuery} currentCell Recalculate the complete dimensions of the table
  */
  _recalculateCurrentCell (currentCell) {
    this._cellIndex = currentCell.index()
    this._rowIndex = currentCell.parents('tr').index()
    this._rows = this._elem.find('tr').length
    this._cols = currentCell.parents('tr').find('td').length
  }

  /**
   * Rebuilds the Abstract Syntax Tree after something has changed. Optionally
   * notifies the callback, if given.
   * @return {void} Does not return.
   */
  _signalContentChange () {
    // Rebuild the AST and notify the callback
    let tableRows = this._elem.find('tr')
    this._ast = [] // Reset the AST
    this._colSizes = [] // Reset the column sizes

    for (let i = 0; i < tableRows.length; i++) {
      let columns = $(tableRows[i]).find('td')
      let rowAST = []
      for (let j = 0; j < columns.length; j++) {
        let content = columns[j].textContent
        rowAST.push(content)

        if (!this._colSizes[j]) this._colSizes[j] = content.length
        if (!this._colAlignment[j]) this._colAlignment[j] = 'left'
        if (content.length > this._colSizes[j]) this._colSizes[j] = content.length
      }

      this._ast.push(rowAST)
    }

    // Now inform the caller that the table has changed with this object.
    if (this._options.hasOwnProperty('onChange')) this._options.onChange(this)
  }

  /**
  * Returns the Markdown table representation of this table
  * @returns {string} The markdown table
  */
  getMarkdownTable () {
    let markdownTable = ''
    // Now build from AST
    for (let i = 0; i < this._ast.length; i++) {
      for (let j = 0; j < this._ast[i].length; j++) {
        if (j === 0) markdownTable += '|'
        // Pad the text contents to fill up to the maximum chars
        switch (this._colAlignment[j]) {
          case 'left':
          case 'center':
            markdownTable += ` ${this._ast[i][j].padEnd(this._colSizes[j], ' ')} |`
            break
          case 'right':
            markdownTable += ` ${this._ast[i][j].padStart(this._colSizes[j], ' ')} |`
            break
        }
      }

      markdownTable += '\n'

      // First row is the header, so add a secondary row.
      if (i === 0) {
        markdownTable += '|'
        for (let k = 0; k < this._colSizes.length; k++) {
          // Respect the spaces left and right and account for alignment
          switch (this._colAlignment[k]) {
            case 'left':
              markdownTable += '-'.repeat(this._colSizes[k] + 2) + '|'
              break
            case 'center':
              markdownTable += ':' + '-'.repeat(this._colSizes[k]) + ':|'
              break
            case 'right':
              markdownTable += '-'.repeat(this._colSizes[k] + 1) + ':|'
              break
          }
        }
        markdownTable += '\n'
      }
    }

    return markdownTable
  }

  /**
   * Moves the curser to the previous column, switching rows if necessary.
   * @return {void} Does not return.
   */
  previousCell () {
    // We're already in the first cell
    if (this._cellIndex === 0 && this._rowIndex === 0) return

    // Focuses the previous cell of the table
    this._cellIndex--

    if (this._cellIndex < 0) {
      // Move to previous row, last cell
      this._rowIndex--
      this._cellIndex = this._cols - 1 // Zero-based indexing
    }

    this.selectCell()
  }

  /**
   * Moves the cursor to the next cell, passing over rows, if necessary.
   * Can add new rows as you go.
   * @param  {Boolean} [automaticallyAddRows=true] Whether to add new rows.
   * @return {void}                              Does not return.
   */
  nextCell (automaticallyAddRows = true) {
    // Focuses the next cell of the table
    let newCellIndex = this._cellIndex + 1
    let newRowIndex = this._rowIndex

    if (newCellIndex + 1 > this._cols) {
      newRowIndex++
      newCellIndex = 0
    }

    if (newRowIndex + 1 > this._rows) {
      if (automaticallyAddRows) {
        let newRow = '<tr style="width: 100%;">' + '<td contenteditable="true"></td>'.repeat(this._cols) + '</tr>'
        this._elem.append($(newRow))
      } else {
        return // We should not add new rows here
      }
    }

    // Set the correct indices
    this._cellIndex = newCellIndex
    this._rowIndex = newRowIndex

    this.selectCell()
  }

  /**
   * Moves the cursor to the same column, previous row.
   * @return {void} Does not return.
   */
  previousRow () {
    // Focuses the same cell in the previous row
    if (this._rowIndex === 0) return // We're already in the first row
    this._rowIndex--

    this.selectCell()
  }

  /**
   * Moves the cursor to the same column, next row. Can also add new
   * rows, if you wish so.
   * @param  {Boolean} [automaticallyAddRows=true] Whether or not to add new rows.
   * @return {void}                              Does not return.
   */
  nextRow (automaticallyAddRows = true) {
    // Focuses the same cell in the next row
    let newRowIndex = this._rowIndex + 1

    if (newRowIndex + 1 > this._rows) {
      if (automaticallyAddRows) {
        this.appendRow()
      } else {
        return // We should not add new rows here
      }
    }

    // Set the new index and select the cell
    this._rowIndex = newRowIndex
    this.selectCell()
  }

  /**
   * Prepends a column to the left side of the table.
   * @return {void} Does not return.
   */
  prependCol () {
    // Add a column to the left of the table -> add a TD child to all TRs
    let newcol = $('<td></td>').attr('contenteditable', 'true')
    newcol.css('text-align', this._colAlignment[this._cellIndex])
    this._elem.find('tr').prepend(newcol.clone())

    // Move into the first cell of the current row
    this._cellIndex = 0
    this.selectCell()
    this._recalculateEdgeButtonPositions()
    this._signalContentChange() // Notify the caller
  }

  /**
   * Appends a column at the right side of the table.
   * @return {void} Does not return.
   */
  appendCol () {
    // Add a column to the right of the table -> add a TD child to all TRs
    let newcol = $('<td></td>').attr('contenteditable', 'true')
    newcol.css('text-align', this._colAlignment[this._cellIndex])
    this._elem.find('tr').append(newcol.clone())

    // Move into the last cell of the current row
    this._cellIndex = this._rows // Rows is one-based number, so it's the correct index
    this.selectCell()
    this._recalculateEdgeButtonPositions()
    this._signalContentChange() // Notify the caller
  }

  /**
   * Prepends a row to the beginning of the table.
   * @return {void} Does not return.
   */
  prependRow () {
    // Prepend a whole row to the table
    let row = $('<tr></tr>')
    for (let i = 0; i < this._cols; i++) {
      let col = $('<td></td>').attr('contenteditable', 'true')
      col.css('text-align', this._colAlignment[i])
      row.append(col)
    }

    this._elem.prepend(row)
    this._rowIndex = 0
    this.selectCell()
    this._recalculateEdgeButtonPositions()
    this._signalContentChange() // Notify the caller
  }

  /**
   * Appends a row at the end of the table.
   * @return {void} Does not return.
   */
  appendRow () {
    // Append a whole row to the table
    let row = $('<tr></tr>')
    for (let i = 0; i < this._cols; i++) {
      let col = $('<td></td>').attr('contenteditable', 'true')
      col.css('text-align', this._colAlignment[i])
      row.append(col)
    }

    this._elem.append(row)

    this._rowIndex = this._rows // One-Based number, so correct index
    this.selectCell()
    this._recalculateEdgeButtonPositions()
    this._signalContentChange() // Notify the caller
  }

  /**
   * Removes the currently active row from the table.
   * @return {void} Does not return.
   */
  pluckRow () {
    // Do not remove the last row
    if (this._rows === 1) return
    // Removes the current row from the table
    let rowToRemove = this._rowIndex
    let firstRow = rowToRemove === 0
    let lastRow = rowToRemove + 1 === this._rows
    let tempIndex
    let newIndex

    if (firstRow) {
      // If the first row should be removed, the temporary index is 1 and the
      // new index is 0.
      tempIndex = 1
      newIndex = 0
    } else if (lastRow) {
      // If the last row should be removed, the temporary index is rows - 2 and
      // the new index is rows - 1
      tempIndex = this._rows - 2
      newIndex = this._rows - 1
    } else {
      // If any other row should be removed, the temporary index is the current
      // +1, the new index is the current.
      tempIndex = this._rowIndex + 1
      newIndex = this._rowIndex
    }

    this._rowIndex = tempIndex
    this.selectCell() // Make sure focus is retained after the row has been removed

    // Now pluck the row.
    this._elem.find('tr:eq(' + rowToRemove + ')').detach()

    // Select "the" cell again (to move back to the original position)
    this._rowIndex = newIndex
    this.selectCell()

    this._recalculateEdgeButtonPositions()
    this._signalContentChange() // Notify the caller
  }

  /**
   * Removes the currently active column from the table.
   * @return {void} Does not return.
   */
  pluckCol () {
    // Do not remove the last column.
    if (this._cols === 1) return
    // Removes the current column from the table
    let colToRemove = this._cellIndex
    let firstCol = colToRemove === 0
    let lastCol = colToRemove + 1 === this._cols
    let tempIndex
    let newIndex

    if (firstCol) {
      // If the first row should be removed, the temporary index is 1 and the
      // new index is 0.
      tempIndex = 1
      newIndex = 0
    } else if (lastCol) {
      // If the last row should be removed, the temporary index is rows - 2 and
      // the new index is rows - 1
      tempIndex = this._cols - 2
      newIndex = this._cols - 1
    } else {
      // If any other row should be removed, the temporary index is the current
      // +1, the new index is the current.
      tempIndex = this._cellIndex + 1
      newIndex = this._cellIndex
    }

    this._cellIndex = tempIndex
    this.selectCell() // Make sure focus is retained after the col has been removed

    // Now pluck the column.
    this._elem.find('tr').find('td:eq(' + colToRemove + ')').detach()

    // Select "the" cell again (to move back to the original position)
    this._cellIndex = newIndex
    this.selectCell()

    this._recalculateEdgeButtonPositions()
    this._signalContentChange() // Notify the caller
  }

  /**
  *
  * @param {string} alignment The new alignment - left, center, or right
  * @param {number} col The column index to change
  */
  changeColAlignment (alignment, col = this._cellIndex) {
    if (!['left', 'center', 'right'].includes(alignment)) throw new Error('Wrong column alignment provided! ' + alignment)
    if (col > this._cellIndex || col < 0) throw new Error('Could not align column - Index out of bounds: ' + col)
    this._colAlignment[col] = alignment

    // Change the visual alignment
    this._elem.find('tr').find('td:eq(' + col + ')').css('text-align', alignment)
    this._signalContentChange() // Recalculate everything
  }

  /**
  * Selects the current cell
  */
  selectCell () {
    this._elem.find('tr:eq(' + this._rowIndex + ') td:eq(' + this._cellIndex + ')').focus()
  }

  /**
   * Injects the necessary CSS into the DOM, making sure it comes before any other
   * CSS sources so you can override the styles, if you wish.
   * @return {void} Does not return.
   */
  _injectCSS () {
    if (document.getElementById('tableHelperCSS')) return // CSS already present

    // Create the styles
    let link = $('<style>').attr('id', 'tableHelperCSS')
    link.text(`
      table.table-helper {
        width: 100%;
        display: inline-table; /* Prevent any issues */
        border: 1px solid #666;
        padding: 0px;
        border-collapse: collapse;
      }

      table.table-helper tr:first-child {
        font-weight: bold;
      }

      table.table-helper td {
        padding: 2px;
        border: 1px solid #666;
        border-collapse: collapse;
        min-width: 10px;
      }

      .table-helper-align-button-container {
        opacity: 0.25;
        transition: 0.2s opacity ease;
        width: ${this._edgeButtonSize * 3}px;
        height: ${this._edgeButtonSize}px;
        border-radius: ${this._edgeButtonSize * 0.25}px;
        overflow: hidden;
        background-color: #fff;
        color: #4d5d75;
        position: absolute;
        box-shadow: 2px 2px 5px 0px rgba(0, 0, 0, .25);
      }

      .table-helper-align-button-container:hover { opacity: 1; }

      .table-helper-align-button, .table-helper-remove-button {
        width: ${this._edgeButtonSize}px;
        height: ${this._edgeButtonSize}px;
        padding-top: ${this._edgeButtonSize * 0.1}px;
        display: inline-block;
        vertical-align: top;
        text-align: center;
        cursor: pointer;
        transition: 0.2s background-color ease;
      }

      .table-helper-align-button:hover, .table-helper-remove-button:hover {
        background-color: #cde;
      }

      .table-helper-align-button-line {
        width: ${this._edgeButtonSize * 0.74}px;
        height: ${this._edgeButtonSize * 0.1}px;
        margin-top: ${this._edgeButtonSize * 0.13}px;
        margin-left: ${this._edgeButtonSize * 0.13}px;
        margin-right: ${this._edgeButtonSize * 0.13}px;
        background-color: #4d5d75;
      }

      .table-helper-align-button.align-left div:last-child {
        width: ${this._edgeButtonSize * 0.4}px;
      }

      .table-helper-align-button.align-right div:last-child {
        width: ${this._edgeButtonSize * 0.4}px;
        margin-left: ${this._edgeButtonSize * 0.47}px;
      }

      .table-helper-align-button.align-center div:nth-child(2) {
        width: ${this._edgeButtonSize * 0.4}px;
        margin-left: ${this._edgeButtonSize * 0.27}px;
      }

      .table-helper-remove-button-container {
        opacity: 0.25;
        transition: 0.2s opacity ease;
        width: ${this._edgeButtonSize * 2}px;
        height: ${this._edgeButtonSize}px;
        border-radius: ${this._edgeButtonSize * 0.25}px;
        overflow: hidden;
        background-color: #fff;
        color: #4d5d75;
        position: absolute;
        box-shadow: 2px 2px 5px 0px rgba(0, 0, 0, .25);
      }

      .table-helper-remove-button-container:hover { opacity: 1; }

      .table-helper-remove-button-line {
        background-color: #4d5d75;
        width: ${this._edgeButtonSize * 0.74}px;
        height: ${this._edgeButtonSize * 0.1}px;
      }

      .table-helper-remove-button {
        /*transform-origin: center center;*/
      }

      .table-helper-remove-button.row .table-helper-remove-button-line {
        position: absolute;
        top: ${this._edgeButtonSize / 2}px;
        left: ${this._edgeButtonSize * 0.13}px; /* The margin */
      }

      .table-helper-remove-button.col .table-helper-remove-button-line {
        position: absolute;
        top: ${this._edgeButtonSize / 2}px;
        left: ${this._edgeButtonSize + this._edgeButtonSize * 0.13}px; /* The margin */
      }

      .table-helper-remove-button-line:nth-child(1) {
        transform: rotate(-45deg);
        background-color: #f56868;
      }
      .table-helper-remove-button-line:nth-child(2) {
        transform: rotate(45deg);
        background-color: #f56868;
      }

      /* row */
      .table-helper-remove-button.row .table-helper-remove-button-line:nth-child(3) {
        transform: rotate(0deg)
        width:
      }

      /* col */
      .table-helper-remove-button.col .table-helper-remove-button-line:nth-child(3) {
        transform: rotate(90deg)
      }

      .table-helper-add-button {
        opacity: 0.25;
        transition: 0.2s opacity ease;
        width: ${this._edgeButtonSize}px;
        height: ${this._edgeButtonSize}px;
        border-radius: ${this._edgeButtonSize}px;
        background-color: #fff;
        color: #4d5d75;
        text-align: center;
        box-shadow: 2px 2px 5px 0px rgba(0, 0, 0, .25);
        line-height: ${this._edgeButtonSize}px;
        cursor: pointer;
        position: absolute;
        font-weight: bold;
      }
      .table-helper-add-button:hover { opacity: 1; }
      `)

    $('head').prepend(link)
  }

  /**
   * Selects the complete text contents of a given element.
   * @param {DOMNode} el The element which contents should be selected.
   */
  _selectElementContents (el) {
    // Selects the text contents of a given element.
    let range = document.createRange()
    range.selectNodeContents(el)
    let sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /**
   * Calculates the position of the caret in the given jQuery element.
   * @param {DOMNode} elem The element in which we should compute the caret position
   */
  _getCursorPositionInElement (elem) {
    let caretPos = 0
    let sel
    let range

    if (window.getSelection) {
      sel = window.getSelection()
      if (sel.rangeCount) {
        range = sel.getRangeAt(0)
        if (range.commonAncestorContainer.parentNode === elem) {
          caretPos = range.endOffset
        }
      }
    } else if (document.selection && document.selection.createRange) {
      range = document.selection.createRange()
      if (range.parentElement() === elem) {
        let helper = document.createElement('span')
        elem.insertBefore(helper, elem.firstChild)
        let tempRange = range.duplicate()
        tempRange.moveToElementText(helper)
        tempRange.setEndPoint('EndToEnd', range)
        caretPos = tempRange.text.length
      }
    }

    return caretPos
  }
}

module.exports = TableHelper
