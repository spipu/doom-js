/**
 * Logiciel : Proto3d - gestion des entrees
 * 
 * Morteur 3D en javascript
 * Distribue sous la licence LGPL. 
 *
 * @author        Laurent MINGUET <webmaster@spipu.net>
 */

// propriete privee permettant d'indiquer l'objet Input principal, necessaire pour onkeydown et onkeyup
var InputObject_private = null;

//Objet Input : pour la gestion du clavier et de la souris
function Input()
{
    if (InputObject_private)
    {
        alert('l\'objet Input existre deja...');
        return false;
    }
    
    InputObject_private = this;

    this.key_add    = false;
    this.key_lst    = new Array();

    this.mouse_add    = false;
    this.mouse_obj    = null;
    this.mouse_x    = null;
    this.mouse_y    = null;
}

// initialise le keyboard
Input.prototype.initKeyboard = function()
{
    if (this.key_add) return true;
    
    this.key_add = true;
    this.key_lst = new Array();
    for (var k=0; k<256; k++) this.key_lst[k] = false;

    document.addEventListener('keydown',    InputObject_private.onkeydown, false);
    document.addEventListener('keyup',        InputObject_private.onkeyup, false);
}

//initialise la souris
Input.prototype.initMouse = function(obj_id)
{
    if (this.mouse_add) return true;
    
    this.mouse_add = true;
    this.mouse_obj = obj_id;
    this.mouse_x = -1;
    this.mouse_y = -1;

    document.addEventListener('mousemove',    InputObject_private.onmousemove, false);
}

// lire une touche
Input.prototype.readKey = function(k, reset)
{
    var v = this.key_lst[k];
    if (reset) this.key_lst[k]=false;
    return v;
}

// lire les touches de direction
Input.prototype.readKeyUp        = function() { return this.key_lst[38]; }
Input.prototype.readKeyDown     = function() { return this.key_lst[40]; }
Input.prototype.readKeyLeft        = function() { return this.key_lst[37]; }
Input.prototype.readKeyRight    = function() { return this.key_lst[39]; }

Input.prototype.readMouseX        = function () { return this.mouse_x; }
Input.prototype.readMouseY        = function () { return this.mouse_y; }

// [PRIVATE] ne pas utiliser
Input.prototype.onkeyup = function(e)
{
    InputObject_private.key_lst[e.keyCode] = false;
    return true;
}

//[PRIVATE] ne pas utiliser
Input.prototype.onkeydown = function(e)
{
    InputObject_private.key_lst[e.keyCode] = true;
    return true;
}

//[PRIVATE] ne pas utiliser
Input.prototype.onmousemove = function(e)
{
    var obj = document.getElementById(InputObject_private.mouse_obj);
    if (!obj) return true;
    
    var x = (e.clientX - obj.offsetLeft);
    var y = (e.clientY - obj.offsetTop);
    
    if (x<0) return true;
    if (y<0) return true;
    if (x>obj.width) return true;
    if (y>obj.height) return true;
    
    InputObject_private.mouse_x = x;
    InputObject_private.mouse_y = y;
}