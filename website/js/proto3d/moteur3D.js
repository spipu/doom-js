function Moteur3D(obj_id)
{
    this.PI_180       = Math.PI/180.0;
    this.scr_id       = obj_id;
    this.scr_width    = 0;
    this.scr_height   = 0;
    this.background   = [0,0,0];
    this.m_vue        = new Matrix();
    this.ouverture    = 0.0;
    this.view_xMin    = 0.0;
    this.view_xMax    = 0.0;
    this.view_yMin    = 0.0;
    this.view_yMax    = 0.0;
    this.light_lst    = new Array();
    this.light_amp    = [0,0,0];
    this.zBuffer      = new Array();
    this.z_near       = 0;
    this.z_far        = 0;
    this.z_def        = 1000;
    this.fast_display = false;

    this.m_vue.Identite();

    this.scr_obj = document.getElementById(obj_id);
    if (!this.scr_obj || !this.scr_obj.getContext) return false;

    this.scr_ctx = this.scr_obj.getContext('2d');
    this.scr_data = new Array();

    this.setScreen(320,240);
    this.setView(-32., 32., -24., 24.);
    this.setOuverture(45.);

    return true;
}

Moteur3D.prototype.setBackground = function(r, g, b)
{
    this.background[0] = r;
    this.background[1] = g;
    this.background[2] = b;
    this.scr_obj.style.background = 'RGB('+r+', '+g+', '+b+')';
    return this;
}

Moteur3D.prototype.setScreen = function(w, h)
{
    this.scr_width  = w;
    this.scr_height = h;
    this.scr_obj.width = w;
    this.scr_obj.height = h;
    this.preCalculViewport();
    return this;
}

Moteur3D.prototype.setOuverture = function(angle_ouverture)
{
    this.ouverture        = this.PI_180*angle_ouverture;
    this.preCalculViewport();
    return this;
}

Moteur3D.prototype.setView = function(xMin, xMax, yMin, yMax)
{
    this.view_xMin = xMin;
    this.view_xMax = xMax;
    this.view_yMin = yMin;
    this.view_yMax = yMax;
    this.preCalculViewport();
    return this;
}

Moteur3D.prototype.setZBuffer = function(near, far)
{
    if (!near) near=1;
    if (!far)  far=80;

    this.z_near = near;
    this.z_far  = far;

    return this;
}

Moteur3D.prototype.fastDisplay = function(mode)
{
    if (!mode) mode = 'on';

    this.fast_display = (mode=='on');
}

Moteur3D.prototype.preCalculViewport = function()
{
    if (!this.scr_width)    return false;
    if (!this.scr_height)    return false;
    if (!this.ouverture)    return false;
    if (this.view_xMax<=this.view_xMin) return false;
    if (this.view_yMax<=this.view_yMin) return false;

    var sx = this.scr_width/(this.view_xMax-this.view_xMin);
    var sy = this.scr_height/(this.view_yMax-this.view_yMin);

    var factor_x = sx*(this.view_xMax-this.view_xMin)/(2*Math.tan(this.ouverture));
    var factor_y = sy*(this.view_xMax-this.view_xMin)/(2*Math.tan(this.ouverture));

    sx = sx*this.view_xMin-0.5;
    sy = sy*this.view_yMin-0.5;

    this.calcul_sx = sx;
    this.calcul_sy = sy;
    this.calcul_fx = factor_x;
    this.calcul_fy = factor_y;
}

Moteur3D.prototype.lightAmbiant = function(color)
{
    this.light_amb = color;
    return this;
}

Moteur3D.prototype.lightAdd = function(color, length, pos)
{
    if (!pos) pos = [0., 0., 0.];
    this.light_lst.push(new Light(color, length, this.m_vue.MultiplicationPos(pos)));
    return this.light_lst.length;
}

Moteur3D.prototype.lightMove = function(id, pos)
{
    if (id) this.light_lst[id-1].changePos(this.m_vue.MultiplicationPos(pos));
    return id;
}

Moteur3D.prototype.matrixIdentity = function()
{
    this.m_vue.Identite();
    return this;
}

Moteur3D.prototype.matrixPush = function()
{
    this.m_vue.Push();
    return this;
}

Moteur3D.prototype.matrixPop = function()
{
    this.m_vue.Pop();
    return this;
}

Moteur3D.prototype.matrixTranslate = function(vx, vy, vz)
{
    var m = new Matrix();
    m.Translation(vx, vy, vz);
    this.m_vue.Multiplication(m);
    return this;
}

Moteur3D.prototype.matrixRotateX = function(rx)
{
    var m = new Matrix();
    m.RotationX(this.PI_180*rx);
    this.m_vue.Multiplication(m);
    return this;
}

Moteur3D.prototype.matrixRotateY = function(ry)
{
    var m = new Matrix();
    m.RotationY(this.PI_180*ry);
    this.m_vue.Multiplication(m);
    return this;
}

Moteur3D.prototype.matrixRotateZ = function(rz)
{
    var m = new Matrix();
    m.RotationZ(this.PI_180*rz);
    this.m_vue.Multiplication(m);
    return this;
}

Moteur3D.prototype.matrixScale = function(sx, sy, sz)
{
    var m = new Matrix();
    m.Scale(sx, sy, sz);
    this.m_vue.Multiplication(m);
    return this;
}

Moteur3D.prototype.drawInit = function()
{
    if (this.fast_display)
    {
        this.scr_ctx.clearRect(0,0,this.scr_width, this.scr_height);
    }
    else
    {
        this.zBuffer = new Array();
        var nb = this.scr_width*this.scr_height;

        for(var k=0; k<nb; k++)
            this.zBuffer[k] = this.z_far;

        this.scr_data = this.scr_ctx.createImageData(this.scr_width, this.scr_height);
    }
    return this;
}

Moteur3D.prototype.drawFinish = function()
{
    if (!this.fast_display)
    {
        this.scr_ctx.putImageData(this.scr_data, 0, 0);
    }
    return this;
}

Moteur3D.prototype.drawObject = function(obj)
{
    if (this.fast_display)
    {
        obj.ptTransform(this.m_vue);
        obj.ptProjection(this);
        obj.fcDrawFast(this);
    }
    else
    {
        obj.ptTransform(this.m_vue);
        obj.ptProjection(this);
        obj.fcDraw(this);
    }
    return this;
}

Moteur3D.prototype.zBufSet = function(x, y, z)
{
    if (x<0)                 return false;
    if (y<0)                 return false;
    if (x>this.scr_width-1)  return false;
    if (y>this.scr_height-1) return false;
    if (z<this.z_near)       return false;
    if (z>this.z_far)        return false;

    var t=x+y*this.scr_width;

    if (this.zBuffer[t]<z) return false;
    this.zBuffer[t]=z;
    return true;
}
